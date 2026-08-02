import { NextResponse } from "next/server";
import { SpotifyError } from "./spotify";
import { GroqError } from "./groq";

export function fail(e: unknown) {
  const status = e instanceof SpotifyError ? e.status : e instanceof GroqError ? 502 : 500;
  const message = e instanceof Error ? e.message : "Something went wrong.";
  console.error("[api]", message);
  return NextResponse.json({ error: message }, { status });
}
