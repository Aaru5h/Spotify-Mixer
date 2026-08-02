"use client";

import { Chip, Slider, TagInput } from "./ui";
import type { Taste } from "@/lib/types";

const LANGUAGES = [
  "English", "Hindi", "Punjabi", "Tamil", "Telugu", "Malayalam", "Bengali", "Marathi",
  "Urdu", "Spanish", "Korean", "Japanese", "French", "Portuguese", "Arabic",
];

const ERAS = ["Pre-70s", "70s", "80s", "90s", "2000s", "2010s", "2020s"];

const GENRE_FALLBACK = [
  "indie", "hip-hop", "R&B", "jazz", "ambient", "rock", "electronic", "folk",
  "soul", "classical", "lo-fi", "punk", "house", "shoegaze", "afrobeats", "ghazal",
];

const LENGTHS = [12, 20, 30, 45];

export default function TastePanel({
  taste,
  onChange,
  genreSuggestions,
}: {
  taste: Taste;
  onChange: (t: Taste) => void;
  genreSuggestions: string[];
}) {
  const set = <K extends keyof Taste>(key: K, value: Taste[K]) => onChange({ ...taste, [key]: value });

  const toggle = (key: "languages" | "eras", v: string) =>
    set(key, taste[key].includes(v) ? taste[key].filter((x) => x !== v) : [...taste[key], v]);

  // Spotify's own genre labels for this listener beat a generic list
  const suggestions = [...new Set([...genreSuggestions, ...GENRE_FALLBACK])].slice(0, 14);

  return (
    <div className="space-y-9">
      <Field label="Anything specific you want to hear?" hint="Genres, scenes, a sound. Leave it empty and it follows your mood instead.">
        <TagInput
          values={taste.genres}
          onChange={(v) => set("genres", v)}
          placeholder="Type a genre and press enter"
          suggestions={suggestions}
        />
      </Field>

      <Field label="Languages" hint="Pick none and it stays open.">
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <Chip key={l} label={l} active={taste.languages.includes(l)} onClick={() => toggle("languages", l)} />
          ))}
        </div>
      </Field>

      <Field label="Era">
        <div className="flex flex-wrap gap-2">
          {ERAS.map((e) => (
            <Chip key={e} label={e} active={taste.eras.includes(e)} onClick={() => toggle("eras", e)} />
          ))}
        </div>
      </Field>

      <div className="grid gap-8 sm:grid-cols-2">
        <Field label="Artists to include">
          <TagInput
            values={taste.mustArtists}
            onChange={(v) => set("mustArtists", v)}
            placeholder="Someone you want on there"
          />
        </Field>
        <Field label="Artists to avoid">
          <TagInput
            values={taste.avoidArtists}
            onChange={(v) => set("avoidArtists", v)}
            placeholder="Not today, thanks"
          />
        </Field>
      </div>

      <Field label="Films or shows to pull from" hint="Songs from these soundtracks. Leave empty to skip.">
        <TagInput
          values={taste.soundtracks}
          onChange={(v) => set("soundtracks", v)}
          placeholder="A movie or show whose songs you want"
        />
      </Field>

      <Field label="Familiar or new">
        <Slider
          value={taste.familiarity}
          onChange={(n) => set("familiarity", n)}
          left="only what I love"
          right="all discovery"
        />
      </Field>

      <div className="grid gap-8 sm:grid-cols-2">
        <Field label="How long">
          <div className="flex flex-wrap gap-2">
            {LENGTHS.map((n) => (
              <Chip key={n} label={`${n} tracks`} active={taste.length === n} onClick={() => set("length", n)} />
            ))}
          </div>
        </Field>

        <Field label="Explicit lyrics">
          <div className="flex gap-2">
            <Chip label="Fine" active={taste.explicitOk} onClick={() => set("explicitOk", true)} />
            <Chip label="Keep it clean" active={!taste.explicitOk} onClick={() => set("explicitOk", false)} />
          </div>
        </Field>
      </div>

      <Field label="Anything else" hint="Optional. A film, a place, a memory, a specific sound.">
        <textarea
          value={taste.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Something like the drive home in the second half of a Wong Kar-wai film"
          className="w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors placeholder:text-faint focus:border-accent"
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[0.95rem] text-ink">{label}</h3>
      {hint && <p className="mt-0.5 mb-3 text-sm text-faint">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </div>
  );
}
