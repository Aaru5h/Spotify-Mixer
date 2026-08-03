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
import { rateLimit } from "@/lib/limit";

const Body = z.object({
  profile: MoodProfile,
  taste: z.object({
    genres: z.array(z.string()).max(20),
    languages: z.array(z.string()).max(20),
    eras: z.array(z.string()).max(20),
    mustArtists: z.array(z.string()).max(20),
    avoidArtists: z.array(z.string()).max(20),
    soundtracks: z.array(z.string()).max(20),
    familiarity: z.number(),
    explicitOk: z.boolean(),
    length: z.number(),
    notes: z.string().max(1000),
  }),
  /** "Artist — Title" strings the user already threw out */
  exclude: z.array(z.string()).max(200).default([]),
});

// Three model rounds, each of which may sit out a rate-limit window, plus the searches.
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const limited = rateLimit(req);
    if (limited) return limited;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Missing mood profile." }, { status: 400 });

    const { profile, exclude } = parsed.data;
    const taste = { ...parsed.data.taste, length: Math.min(Math.max(parsed.data.taste.length, 8), 50) };

    const session = await getSession();
    // Guests get null: resolution falls back to the app token, which no user cap applies
    // to. They just lose the listening-history calibration, since that needs /me.
    const user = session.accessToken ? session : null;
    const market = session.market ?? "US";
    const { topArtists, recentArtists } = user
      ? await getTaste(user).catch(() => ({ topArtists: [] as string[], recentArtists: [] as string[] }))
      : { topArtists: [] as string[], recentArtists: [] as string[] };

    const kept: ResolvedTrack[] = [];
    const seen = new Set<string>();
    const rejected = [...exclude];
    let meta: Pick<z.infer<typeof Curation>, "playlist_name" | "playlist_description" | "arc_note"> | null =
      null;
    let dropped = 0;

    // Search resolution always loses a few candidates. Over-ask, then top up if we came
    // up short. Asking for the whole playlist in one call is what truncated the JSON and
    // blew the free tier's per-minute budget — keep each call small, take more rounds.
    for (let round = 0; round < 3 && kept.length < taste.length; round++) {
      const shortfall = taste.length - kept.length;
      const ask = Math.min(Math.ceil(shortfall * 1.7) + 4, 24);

      let curation;
      try {
        curation = await groqJSON({
          schema: Curation,
          name: "curation",
          system: CURATE_SYSTEM,
          user: curateUser({ profile, taste, topArtists, recentArtists, exclude: rejected, ask }),
          temperature: round === 0 ? 0.8 : 0.95, // widen the net on the top-up
          // ~90 tokens per candidate (reasoning is spent from the same budget) plus the
          // name/description/arc. Raise alongside the per-round cap above if the tier changes.
          maxTokens: 900 + ask * 90,
        });
      } catch (e) {
        if (kept.length) break; // a short playlist beats an error page
        throw e;
      }

      meta ??= curation;
      for (const c of curation.tracks) rejected.push(`${c.artist} — ${c.title}`);

      const res = await resolveTracks(user, curation.tracks, market, {
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

    if (user) await session.save();

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
