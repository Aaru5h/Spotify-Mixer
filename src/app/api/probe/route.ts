import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { getTaste } from "@/lib/spotify";
import { groqJSON } from "@/lib/groq";
import { PROBE_SYSTEM, probeUser } from "@/lib/prompts";
import { ProbeResult } from "@/lib/types";
import { fail } from "@/lib/http";

const Body = z.object({ note: z.string().min(1).max(4000) });

export async function POST(req: Request) {
  try {
    const body = Body.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: "Write a little about how you're doing first." }, { status: 400 });
    }

    const session = await getSession();
    // taste is context only here; a failure must not block the questions
    const taste = session.accessToken
      ? await getTaste(session).catch(() => ({ topArtists: [], recentArtists: [], genres: [] }))
      : { topArtists: [], recentArtists: [], genres: [] };

    const result = await groqJSON({
      schema: ProbeResult,
      name: "probe",
      system: PROBE_SYSTEM,
      user: probeUser({ note: body.data.note, ...taste }),
      temperature: 0.75,
      maxTokens: 3000,
    });

    await session.save();
    // hard cap regardless of what the model decided — the promise was "not a quiz"
    return NextResponse.json({ ...result, questions: result.questions.slice(0, 6) });
  } catch (e) {
    return fail(e);
  }
}
