import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { getTaste, resolveTracks } from "@/lib/spotify";
import { groqJSON } from "@/lib/groq";
import { CURATE_SYSTEM, curateUser } from "@/lib/prompts";
import { Curation, MoodProfile } from "@/lib/types";
import { dedupeKey } from "@/lib/resolve";
import type { ResolvedTrack } from "@/lib/types";
import { fail } from "@/lib/http";

const Body = z.object({
  profile: MoodProfile,
  taste: z.object({
    genres: z.array(z.string()).max(20),
    languages: z.array(z.string()).max(20),
    eras: z.array(z.string()).max(20),
    mustArtists: z.array(z.string()).max(20),
    avoidArtists: z.array(z.string()).max(20),
    familiarity: z.number(),
    explicitOk: z.boolean(),
    length: z.number(),
    notes: z.string().max(1000),
  }),
  /** "Artist — Title" strings the user already threw out */
  exclude: z.array(z.string()).max(200).default([]),
});

export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Missing mood profile." }, { status: 400 });

    const { profile, exclude } = parsed.data;
    const taste = { ...parsed.data.taste, length: Math.min(Math.max(parsed.data.taste.length, 8), 50) };

    const session = await getSession();
    if (!session.accessToken) {
      return NextResponse.json({ error: "Connect Spotify first." }, { status: 401 });
    }
    const market = session.market ?? "US";
    const { topArtists, recentArtists } = await getTaste(session).catch(() => ({
      topArtists: [] as string[],
      recentArtists: [] as string[],
    }));

    const kept: ResolvedTrack[] = [];
    const seen = new Set<string>();
    const rejected = [...exclude];
    let meta: Pick<z.infer<typeof Curation>, "playlist_name" | "playlist_description" | "arc_note"> | null =
      null;
    let dropped = 0;

    // Search resolution always loses a few candidates. Over-ask, then top up
    // once if we still came up short — two rounds is plenty in practice.
    for (let round = 0; round < 2 && kept.length < taste.length; round++) {
      const shortfall = taste.length - kept.length;
      const ask = Math.min(round === 0 ? Math.ceil(shortfall * 1.7) + 5 : shortfall * 2 + 4, 70);

      const curation = await groqJSON({
        schema: Curation,
        name: "curation",
        system: CURATE_SYSTEM,
        user: curateUser({ profile, taste, topArtists, recentArtists, exclude: rejected, ask }),
        temperature: round === 0 ? 0.8 : 0.95, // widen the net on the top-up
        maxTokens: 16000,
      });

      meta ??= curation;
      for (const c of curation.tracks) rejected.push(`${c.artist} — ${c.title}`);

      const res = await resolveTracks(session, curation.tracks, market, {
        limit: taste.length - kept.length,
        excludeKeys: seen,
      });
      dropped += res.dropped;
      for (const t of res.tracks) {
        seen.add(dedupeKey(t.artist, t.title));
        seen.add(t.id);
        kept.push(t);
      }
    }

    await session.save();

    if (!kept.length) {
      return NextResponse.json(
        { error: "Could not find any of these on Spotify. Try loosening the language or era filters." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      name: meta?.playlist_name ?? "Untitled",
      description: meta?.playlist_description ?? "",
      arc: meta?.arc_note ?? "",
      tracks: kept,
      dropped,
    });
  } catch (e) {
    return fail(e);
  }
}
