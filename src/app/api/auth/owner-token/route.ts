import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/** One-time setup helper: prints the refresh token of whoever is logged in locally, so it
 *  can be pasted into OWNER_REFRESH_TOKEN. Guest playlists get written to that account.
 *  404s in production — it must never be reachable on the deployed app. */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const session = await getSession();
  if (!session.refreshToken) {
    return NextResponse.json({ error: "Connect Spotify first, then reload this page." }, { status: 401 });
  }
  return NextResponse.json({
    user: session.displayName,
    OWNER_REFRESH_TOKEN: session.refreshToken,
    next: "Put this in .env.local and in the Vercel project's environment variables.",
  });
}
