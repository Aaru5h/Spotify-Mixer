import { z } from "zod";

/** Everything the model returns is strict-schema constrained, so no `.optional()`
 *  anywhere in here — use `.nullable()` or an empty-able array instead. */

export const IntentValues = ["match", "lift", "settle", "release", "distract"] as const;
export type Intent = (typeof IntentValues)[number];

export const INTENT_COPY: Record<Intent, { label: string; blurb: string }> = {
  match: { label: "Sit with it", blurb: "Music that meets you exactly where you are." },
  lift: { label: "Lift me", blurb: "Start near your mood, climb somewhere brighter." },
  settle: { label: "Settle me", blurb: "Bring the volume of everything down." },
  release: { label: "Let it out", blurb: "Go all the way into it until it burns off." },
  distract: { label: "Take me elsewhere", blurb: "Somewhere else entirely, for a while." },
};

/* ---------- step 1 → adaptive probe questions ---------- */

export const ProbeQuestion = z.object({
  id: z.string(),
  question: z.string(),
  kind: z.enum(["scale", "choice", "text"]),
  /** scale only; ignored otherwise */
  left_label: z.string(),
  right_label: z.string(),
  /** choice only; empty for other kinds */
  options: z.array(z.string()),
  /** shown under the question as a light subtitle */
  hint: z.string(),
});
export type ProbeQuestion = z.infer<typeof ProbeQuestion>;

export const ProbeResult = z.object({
  /** reflected back before the questions, so it never feels like a form */
  opening_line: z.string(),
  questions: z.array(ProbeQuestion),
});
export type ProbeResult = z.infer<typeof ProbeResult>;

/* ---------- step 2 → mood profile ---------- */

export const Dimensions = z.object({
  valence: z.number(),
  energy: z.number(),
  tension: z.number(),
  social: z.number(),
  nostalgia: z.number(),
});
export type Dimensions = z.infer<typeof Dimensions>;

export const DIMENSION_META: {
  key: keyof Dimensions;
  label: string;
  low: string;
  high: string;
}[] = [
  { key: "valence", label: "Colour", low: "heavy", high: "bright" },
  { key: "energy", label: "Charge", low: "depleted", high: "wired" },
  { key: "tension", label: "Tension", low: "settled", high: "on edge" },
  { key: "social", label: "Facing", low: "inward", high: "outward" },
  { key: "nostalgia", label: "Time", low: "right now", high: "looking back" },
];

export const MoodProfile = z.object({
  /** 2–6 words naming the state. Specific, never "Mixed Feelings". */
  headline: z.string(),
  /** 2–3 sentences reflecting the person back to themselves */
  reading: z.string(),
  primary_emotion: z.string(),
  secondary_emotions: z.array(z.string()),
  dimensions: Dimensions,
  intent: z.enum(IntentValues),
  /** the sound, in production terms — this is what actually steers curation */
  sonic_direction: z.string(),
  confidence: z.number(),
  /** what the model is genuinely unsure of; surfaced as correction prompts */
  uncertain_about: z.array(z.string()),
});
export type MoodProfile = z.infer<typeof MoodProfile>;

/* ---------- taste constraints (pure UI state, never model-generated) ---------- */

export type Taste = {
  genres: string[];
  languages: string[];
  eras: string[];
  mustArtists: string[];
  avoidArtists: string[];
  soundtracks: string[]; // films/shows to pull songs from
  familiarity: number; // 0 = only what I know, 100 = all discovery
  explicitOk: boolean;
  length: number;
  notes: string;
};

export const DEFAULT_TASTE: Taste = {
  genres: [],
  languages: [],
  eras: [],
  mustArtists: [],
  avoidArtists: [],
  soundtracks: [],
  familiarity: 45,
  explicitOk: true,
  length: 20,
  notes: "",
};

/* ---------- step 3 → curation ---------- */

export const CandidateTrack = z.object({
  artist: z.string(),
  title: z.string(),
  /** helps disambiguate at search time; "" when unknown */
  album: z.string(),
  /** one line, in the second person. Shown to the user. */
  reason: z.string(),
});
export type CandidateTrack = z.infer<typeof CandidateTrack>;

export const Curation = z.object({
  /** 2–5 words. No emoji, no "Vibes"/"Feels"/"Mix"/"Playlist". */
  playlist_name: z.string(),
  /** one or two sentences for the Spotify description field */
  playlist_description: z.string(),
  /** how the sequence moves start → end */
  arc_note: z.string(),
  tracks: z.array(CandidateTrack),
});
export type Curation = z.infer<typeof Curation>;

/* ---------- resolved (Spotify-confirmed) tracks ---------- */

export type ResolvedTrack = {
  id: string;
  uri: string;
  title: string;
  artist: string;
  album: string;
  art: string | null;
  durationMs: number;
  url: string;
  reason: string;
};
