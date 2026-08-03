import { NextResponse } from "next/server";

/** Per-IP throttle for the routes that cost Groq tokens. A full session is 3–5 calls,
 *  so this allows roughly three playlists per IP per window and stops one person
 *  draining the shared per-minute budget for everyone else.
 *
 *  ponytail: in-memory, so the counter is per serverless instance and resets on deploy —
 *  a determined abuser spread across instances gets more than MAX. That is fine for a
 *  shared-token hobby deployment; move to Upstash/Redis if the Groq bill ever notices. */
const WINDOW_MS = 10 * 60_000;
const MAX = 18;

const hits = new Map<string, number[]>();

export function rateLimit(req: Request): NextResponse | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now();

  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);

  // keep the map from growing forever on a long-lived instance
  if (hits.size > 2000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  }

  if (recent.length > MAX) {
    const retry = Math.ceil((WINDOW_MS - (now - recent[0])) / 1000);
    return NextResponse.json(
      { error: "That's a lot of playlists in one go. Give it a few minutes and come back." },
      { status: 429, headers: { "retry-after": String(retry) } }
    );
  }
  return null;
}
