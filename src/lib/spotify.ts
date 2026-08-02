import type { Session } from "./session";
import { pickBest, dedupeKey } from "./resolve";
import type { CandidateTrack, ResolvedTrack } from "./types";

const API = "https://api.spotify.com/v1";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

export const SCOPES = [
  "user-read-private",
  "user-top-read",
  "user-read-recently-played",
  "playlist-modify-private",
  "playlist-modify-public",
].join(" ");

export class SpotifyError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
  }
}

function creds() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new SpotifyError("Spotify credentials are not configured.", 500);
  return { id, secret, basic: Buffer.from(`${id}:${secret}`).toString("base64") };
}

export function redirectUri() {
  const base = process.env.APP_URL ?? "http://127.0.0.1:3000";
  return `${base.replace(/\/$/, "")}/api/auth/callback`;
}

/* ---------------- tokens ---------------- */

export async function exchangeCode(code: string) {
  const { basic } = creds();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}` },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
    }),
  });
  if (!res.ok) throw new SpotifyError(`Token exchange failed: ${await res.text()}`, 401);
  return (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
}

async function refresh(session: Session) {
  if (!session.refreshToken) throw new SpotifyError("Not connected to Spotify.", 401);
  const { basic } = creds();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: session.refreshToken }),
  });
  if (!res.ok) throw new SpotifyError("Spotify session expired. Reconnect to continue.", 401);
  const json = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
  session.accessToken = json.access_token;
  session.expiresAt = Date.now() + json.expires_in * 1000;
  // Spotify only sometimes rotates the refresh token; keep the old one otherwise
  if (json.refresh_token) session.refreshToken = json.refresh_token;
}

/** Authenticated call. Refreshes ahead of expiry and once more on a 401.
 *  Mutates `session` — the caller must `.save()` afterwards. */
export async function api<T>(session: Session, path: string, init?: RequestInit): Promise<T> {
  if (!session.accessToken) throw new SpotifyError("Not connected to Spotify.", 401);
  if (!session.expiresAt || session.expiresAt - 60_000 < Date.now()) await refresh(session);

  const send = () =>
    fetch(`${API}${path}`, {
      ...init,
      headers: {
        ...init?.headers,
        authorization: `Bearer ${session.accessToken}`,
        "content-type": "application/json",
      },
    });

  let res = await send();
  if (res.status === 401) {
    await refresh(session);
    res = await send();
  }
  if (res.status === 429) {
    const wait = Math.min(Number(res.headers.get("retry-after") ?? 2), 8);
    await new Promise((r) => setTimeout(r, wait * 1000));
    res = await send();
  }
  if (res.status === 403) {
    throw new SpotifyError(
      `Spotify refused ${init?.method ?? "GET"} ${path} (403): ${(await res.text()).slice(0, 200)} — if this is a new app, check the user is added under Users and Access in the dashboard.`,
      403
    );
  }
  if (!res.ok) throw new SpotifyError(`Spotify ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
  return res.status === 204 ? (null as T) : ((await res.json()) as T);
}

/* ---------------- reads ---------------- */

type SpotifyArtist = { id: string; name: string; genres?: string[] };
type SpotifyTrack = {
  id: string | null;
  uri: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  external_urls: { spotify: string };
  is_playable?: boolean;
};

export async function getProfile(session: Session) {
  return api<{ id: string; display_name: string | null; country: string | null }>(session, "/me");
}

/** Taste signal. Medium term is the best default: recent enough to be current,
 *  long enough not to be skewed by one weird week. */
export async function getTaste(session: Session) {
  const [top, recent] = await Promise.all([
    api<{ items: SpotifyArtist[] }>(session, "/me/top/artists?limit=30&time_range=medium_term").catch(
      () => ({ items: [] as SpotifyArtist[] })
    ),
    api<{ items: { track: SpotifyTrack }[] }>(session, "/me/player/recently-played?limit=50").catch(
      () => ({ items: [] as { track: SpotifyTrack }[] })
    ),
  ]);

  const topArtists = top.items.map((a) => a.name);
  const genres = [...new Set(top.items.flatMap((a) => a.genres ?? []))].slice(0, 25);
  const recentArtists = [
    ...new Set(recent.items.flatMap((i) => i.track?.artists?.map((a) => a.name) ?? [])),
  ].slice(0, 20);

  return { topArtists, recentArtists, genres };
}

/* ---------------- search + resolve ---------------- */

function toResolved(t: SpotifyTrack, reason: string): ResolvedTrack | null {
  if (!t.id) return null; // local/unavailable tracks have no id and cannot be added
  return {
    id: t.id,
    uri: t.uri,
    title: t.name,
    artist: t.artists.map((a) => a.name).join(", "),
    album: t.album?.name ?? "",
    art: t.album?.images?.at(-1)?.url ?? null,
    durationMs: t.duration_ms,
    url: t.external_urls?.spotify ?? "",
    reason,
  };
}

async function searchOne(
  session: Session,
  c: CandidateTrack,
  market: string
): Promise<ResolvedTrack | null> {
  // Field filters first (precise), then a loose query — the LLM's punctuation
  // and the released title often differ enough to break the strict form.
  const queries = [
    `track:"${c.title}" artist:"${c.artist}"`,
    `${c.artist} ${c.title}`,
  ];

  for (const q of queries) {
    const res = await api<{ tracks: { items: SpotifyTrack[] } }>(
      session,
      `/search?q=${encodeURIComponent(q)}&type=track&limit=8&market=${market}`
    ).catch(() => null);

    const items = res?.tracks?.items ?? [];
    if (!items.length) continue;

    const idx = pickBest(
      { title: c.title, artist: c.artist },
      items.map((t) => ({ title: t.name, artists: t.artists.map((a) => a.name) }))
    );
    if (idx >= 0) {
      const resolved = toResolved(items[idx], c.reason);
      if (resolved) return resolved;
    }
  }
  return null;
}

/** Resolve candidates against Spotify, dropping anything that doesn't verifiably
 *  exist. Order is preserved because the LLM already sequenced them. */
export async function resolveTracks(
  session: Session,
  candidates: CandidateTrack[],
  market: string,
  opts: { limit: number; excludeKeys?: Set<string> }
): Promise<{ tracks: ResolvedTrack[]; dropped: number }> {
  const results: (ResolvedTrack | null)[] = new Array(candidates.length).fill(null);
  let cursor = 0;

  // ponytail: fixed pool of 6, plenty for ~35 candidates. Swap for a real
  // limiter only if playlists ever get long enough to matter.
  const worker = async () => {
    while (cursor < candidates.length) {
      const i = cursor++;
      results[i] = await searchOne(session, candidates[i], market).catch(() => null);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));

  const seen = new Set(opts.excludeKeys ?? []);
  const tracks: ResolvedTrack[] = [];
  let dropped = 0;

  for (const r of results) {
    if (!r) {
      dropped++;
      continue;
    }
    const key = dedupeKey(r.artist, r.title);
    if (seen.has(key) || seen.has(r.id)) continue;
    seen.add(key);
    seen.add(r.id);
    tracks.push(r);
    if (tracks.length >= opts.limit) break;
  }

  return { tracks, dropped };
}

/* ---------------- write ---------------- */

export async function createPlaylist(
  session: Session,
  input: { name: string; description: string; uris: string[]; isPublic: boolean }
) {
  if (!session.userId) throw new SpotifyError("Not connected to Spotify.", 401);
  if (!input.uris.length) throw new SpotifyError("No tracks to add.", 400);

  const playlist = await api<{ id: string; external_urls: { spotify: string } }>(
    session,
    `/me/playlists`,
    {
      method: "POST",
      body: JSON.stringify({
        name: input.name.slice(0, 100),
        description: input.description.replace(/\s+/g, " ").slice(0, 300),
        public: input.isPublic,
      }),
    }
  );

  for (let i = 0; i < input.uris.length; i += 100) {
    // /tracks is deprecated and hard-403s for apps created after Nov 2024 — /items is the replacement.
    await api(session, `/playlists/${playlist.id}/items`, {
      method: "POST",
      body: JSON.stringify({ uris: input.uris.slice(i, i + 100) }),
    });
  }

  return { id: playlist.id, url: playlist.external_urls.spotify };
}
