import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { SCOPES, redirectUri } from "@/lib/spotify";
import { fail } from "@/lib/http";

export async function GET() {
  try {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    if (!clientId) throw new Error("SPOTIFY_CLIENT_ID is not set. See .env.example.");

    const session = await getSession();
    const state = crypto.randomUUID();
    session.authState = state;
    await session.save();

    const url = new URL("https://accounts.spotify.com/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri());
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("state", state);

    return NextResponse.redirect(url.toString());
  } catch (e) {
    return fail(e);
  }
}
