import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { createPlaylist } from "@/lib/spotify";
import { fail } from "@/lib/http";

const Body = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(300),
  uris: z.array(z.string().startsWith("spotify:track:")).min(1).max(100),
  isPublic: z.boolean(),
});

export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

    const session = await getSession();
    const result = await createPlaylist(session, parsed.data);
    await session.save();
    return NextResponse.json(result);
  } catch (e) {
    return fail(e);
  }
}
