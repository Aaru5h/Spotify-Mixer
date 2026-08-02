import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { getTaste } from "@/lib/spotify";
import { groqJSON, clamp } from "@/lib/groq";
import { ASSESS_SYSTEM, assessUser } from "@/lib/prompts";
import { MoodProfile, ProbeQuestion } from "@/lib/types";
import { fail } from "@/lib/http";

const TasteBody = z.object({
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
});

const Body = z.object({
  note: z.string().min(1).max(4000),
  questions: z.array(ProbeQuestion).max(8),
  answers: z.record(z.string(), z.string()),
  taste: TasteBody,
});

export async function POST(req: Request) {
  try {
    const body = Body.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: "Incomplete answers." }, { status: 400 });

    const session = await getSession();
    const { topArtists } = session.accessToken
      ? await getTaste(session).catch(() => ({ topArtists: [] as string[] }))
      : { topArtists: [] as string[] };

    const profile = await groqJSON({
      schema: MoodProfile,
      name: "mood_profile",
      system: ASSESS_SYSTEM,
      user: assessUser({ ...body.data, topArtists }),
      temperature: 0.5, // this is a reading, not a creative act
      maxTokens: 2000, // headroom for reasoning tokens
    });

    await session.save();
    return NextResponse.json({
      ...profile,
      confidence: clamp(profile.confidence),
      dimensions: Object.fromEntries(
        Object.entries(profile.dimensions).map(([k, v]) => [k, clamp(v)])
      ),
      uncertain_about: profile.uncertain_about.slice(0, 3),
    });
  } catch (e) {
    return fail(e);
  }
}
