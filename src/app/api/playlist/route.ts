import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { createPlaylist, ownerSession } from "@/lib/spotify";
import { fail } from "@/lib/http";
import { rateLimit } from "@/lib/limit";

const Body = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(300),
  uris: z.array(z.string().startsWith("spotify:track:")).min(1).max(100),
  isPublic: z.boolean(),
});

export async function POST(req: Request) {
  try {
    const limited = rateLimit(req);
    if (limited) return limited;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

    const session = await getSession();

    // A guest's own account can't be written to — they aren't on the app's allowlist and
    // never will be, since development mode is permanent here. Creation needs *an*
    // authenticated user though, not *the visitor*: write to the owner's account and hand
    // back the link. Anyone can open a playlist; only the allowlisted 25 can own one.
    if (!session.accessToken) {
      const owner = await ownerSession();
      const result = await createPlaylist(owner, { ...parsed.data, isPublic: true });
      return NextResponse.json({ ...result, guest: true });
    }

    const result = await createPlaylist(session, parsed.data);
    await session.save();
    return NextResponse.json(result);
  } catch (e) {
    return fail(e);
  }
}
