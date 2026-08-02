# Mood Mixer

Write about how you're doing. It asks a few questions shaped by what you wrote,
tells you what it thinks you're feeling, lets you correct it, then builds the
playlist in your Spotify.

Next.js (full stack — no separate server), Groq, Spotify Web API. No database.

## Setup

**1. Spotify app** — [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → Create app.

Set the redirect URI to exactly:

```
http://127.0.0.1:3000/api/auth/callback
```

> Spotify no longer accepts `localhost` in redirect URIs. It must be the loopback
> IP, and you must browse to `127.0.0.1:3000` too — not `localhost:3000`, or the
> session cookie won't match.

Then add your own Spotify account under **Users and Access**. New apps are in
Development Mode and only work for accounts listed there.

**2. Groq key** — [console.groq.com/keys](https://console.groq.com/keys).

**3. Environment**

```bash
cp .env.example .env.local
```

Fill in `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `GROQ_API_KEY`.
`SESSION_SECRET` needs 32+ characters — `openssl rand -base64 32`.

**4. Run**

```bash
npm install
npm run dev
```

Open **http://127.0.0.1:3000**.

## Commands

```bash
npm run dev     # dev server
npm run build   # production build
npm test        # track-matching assertions (no network, no framework)
```

## How it works

| Step | What happens |
|---|---|
| Write | One open textarea. The highest-signal input by far. |
| Questions | `/api/probe` — Groq reads the note and writes 4–6 questions *about what you actually said*. Never a fixed quiz. |
| Music | Genre, language, era, artists to include or avoid, familiar-vs-new, length. All optional. |
| Mood | `/api/assess` — a named state, a written reading, five dimensions, and what the music should *do*. Everything editable; "Not quite" re-reads with your correction. |
| Playlist | `/api/curate` — Groq names real tracks, every one resolved through Spotify search. Anything unverifiable is dropped, not guessed. |
| Save | `/api/playlist` — creates it in your account. |

Three Groq calls per session, all with strict JSON-schema constrained decoding.

## Why the LLM picks the tracks

Spotify deprecated `/recommendations`, `/audio-features` and `/related-artists` in
November 2024. They return 403 for every app created since, with no way to apply.
So the usual "mood → audio feature vector → ask Spotify" design is not available.

Here the LLM does the recommending and Spotify only resolves and writes. That turns
out to suit the goal better anyway — language, era and artist steering are native to
a language model and were always awkward to encode as feature vectors.

The tradeoff is hallucinated tracks, handled by verifying every single candidate
through `/search` before it can reach your playlist. See `MEMORY.md`.

## Deploying

Works on Vercel free tier as-is. Set the same env vars, change `APP_URL` to your
domain, and add `https://your-domain/api/auth/callback` to the Spotify dashboard.

Add rate limiting on the API routes before making it public — Groq calls cost money
and nothing currently stops a loop.
