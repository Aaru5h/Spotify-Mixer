import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { exchangeCode, getProfile } from "@/lib/spotify";

const home = (req: NextRequest, params: Record<string, string> = {}) => {
  const url = new URL("/", process.env.APP_URL ?? req.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url.toString());
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const denied = req.nextUrl.searchParams.get("error");

  // single-use: consume the nonce whatever happens next
  const expected = session.authState;
  session.authState = undefined;

  if (denied) {
    await session.save();
    return home(req, { error: "Spotify connection was cancelled." });
  }
  if (!code || !state || !expected || state !== expected) {
    await session.save();
    return home(req, { error: "Could not verify that sign-in. Please try connecting again." });
  }

  try {
    const token = await exchangeCode(code);
    session.accessToken = token.access_token;
    session.refreshToken = token.refresh_token;
    session.expiresAt = Date.now() + token.expires_in * 1000;

    const me = await getProfile(session);
    session.userId = me.id;
    session.displayName = me.display_name ?? "you";
    session.market = me.country ?? "US";

    await session.save();
    return home(req);
  } catch (e) {
    await session.save();
    return home(req, { error: e instanceof Error ? e.message : "Sign-in failed." });
  }
}
