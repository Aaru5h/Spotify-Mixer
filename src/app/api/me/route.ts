import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getTaste } from "@/lib/spotify";
import { fail } from "@/lib/http";

/** Connection status plus the taste signal the UI seeds its chips from. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session.accessToken) return NextResponse.json({ connected: false });

    const taste = await getTaste(session);
    await session.save(); // persist any refreshed token
    return NextResponse.json({
      connected: true,
      displayName: session.displayName ?? "you",
      ...taste,
    });
  } catch (e) {
    return fail(e);
  }
}
