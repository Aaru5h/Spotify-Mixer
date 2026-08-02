/** Matching an LLM-named track against Spotify search results.
 *  Pure functions, no network — see resolve.test.ts. */

export type SearchHit = { title: string; artists: string[] };

/** Lowercase, de-accent, drop bracketed suffixes and feature credits, strip punctuation. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    // Fold Latin accents (Björk → bjork) WITHOUT touching combining marks in
    // other scripts — Devanagari matras and Hangul jamo are \p{M} too, and
    // stripping those destroys the word ("तुम ही हो" → "तम ह ह").
    .normalize("NFD")
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .normalize("NFC")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\s[-–—]\s.*$/, " ") // "Song - 2011 Remaster"
    .replace(/\b(feat|ft|featuring|with)\.?\s.*$/, " ")
    .replace(/&/g, " and ")
    // keep every script's letters/digits — Devanagari, Hangul, Kana, Cyrillic
    // titles must survive normalisation or they can never resolve
    // \p{M} stays: Latin accents are already folded above, and everywhere else
    // combining marks are part of the word, not punctuation.
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim();
}

const tokens = (s: string) => new Set(norm(s).split(" ").filter(Boolean));

/** Sørensen–Dice over word tokens. 1 = identical, 0 = disjoint. */
export function dice(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return (2 * shared) / (ta.size + tb.size);
}

/** Containment counts as a strong match — "Redbone" vs "Redbone" on an album
 *  whose Spotify title carries extra words. Guarded by a length floor so
 *  short titles don't match everything. */
function similarity(want: string, got: string): number {
  const w = norm(want);
  const g = norm(got);
  if (!w || !g) return 0;
  if (w === g) return 1;
  if (w.length >= 5 && (g.startsWith(w + " ") || w.startsWith(g + " "))) return 0.92;
  return dice(w, g);
}

export const TITLE_FLOOR = 0.8;
export const ARTIST_FLOOR = 0.6;

/** norm() deliberately strips "- Live" and "- 2004 Remaster" so both still match
 *  the plain title. That makes them score identically, so re-break the tie here
 *  on the raw strings: prefer the canonical take, but still accept an alternate
 *  version when it is the only thing Spotify has. */
const VERSION_MARKER =
  /\b(live|remix|remaster(ed)?|acoustic|instrumental|karaoke|cover|demo|edit|sped up|slowed|re-?recorded|taylor's version)\b/i;

function versionPenalty(wantTitle: string, hitTitle: string): number {
  const wanted = VERSION_MARKER.test(wantTitle);
  const got = VERSION_MARKER.test(hitTitle);
  return !wanted && got ? 0.5 : 0;
}

export function scoreHit(
  want: { title: string; artist: string },
  hit: SearchHit
): { score: number; ok: boolean } {
  const title = similarity(want.title, hit.title);
  // best single artist wins: collaborations list several, we only named one
  const artist = Math.max(
    similarity(want.artist, hit.artists.join(" ")),
    ...hit.artists.map((a) => similarity(want.artist, a))
  );
  const ok = title >= TITLE_FLOOR && artist >= ARTIST_FLOOR;
  return { score: title * 2 + artist - versionPenalty(want.title, hit.title), ok };
}

/** Index of the best acceptable hit, or -1. Spotify returns results in
 *  relevance order, so ties keep the earlier hit. */
export function pickBest(want: { title: string; artist: string }, hits: SearchHit[]): number {
  let bestIdx = -1;
  let bestScore = -1;
  hits.forEach((hit, i) => {
    const { score, ok } = scoreHit(want, hit);
    if (ok && score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  });
  return bestIdx;
}

/** Same song from a different release should not appear twice. */
export const dedupeKey = (artist: string, title: string) => `${norm(artist)}::${norm(title)}`;
