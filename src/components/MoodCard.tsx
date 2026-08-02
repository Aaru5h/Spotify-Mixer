"use client";

import { useState } from "react";
import { Button, Slider } from "./ui";
import { DIMENSION_META, INTENT_COPY, IntentValues, type Intent, type MoodProfile } from "@/lib/types";

export default function MoodCard({
  profile,
  onChange,
  onRecheck,
  rechecking,
}: {
  profile: MoodProfile;
  onChange: (p: MoodProfile) => void;
  onRecheck: (correction: string) => void;
  rechecking: boolean;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [correction, setCorrection] = useState("");

  return (
    <div className="space-y-10">
      <header className="rise">
        <p className="text-xs uppercase tracking-[0.18em] text-faint">What I&rsquo;m hearing</p>
        <h2 className="display mt-3 text-4xl sm:text-5xl">{profile.headline}</h2>
        <p className="mt-5 max-w-prose text-[1.05rem] leading-relaxed text-muted">{profile.reading}</p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {[profile.primary_emotion, ...profile.secondary_emotions].map((e, i) => (
            <span
              key={e + i}
              className={`rounded-full px-3 py-1 text-sm ${
                i === 0 ? "bg-accent text-accent-ink" : "border border-line text-muted"
              }`}
            >
              {e}
            </span>
          ))}
          <span className="ml-auto text-xs text-faint">{profile.confidence}% sure</span>
        </div>
      </header>

      {/* correction loop — the single biggest accuracy lever in the whole app */}
      <section className="rounded-2xl border border-line bg-raised px-5 py-4">
        {!correcting ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-ink">Did I get that right?</p>
              {profile.uncertain_about.length > 0 && (
                <p className="mt-1 text-sm text-faint">
                  Still unsure: {profile.uncertain_about.join(" · ")}
                </p>
              )}
            </div>
            <button
              onClick={() => setCorrecting(true)}
              className="shrink-0 text-sm text-accent underline underline-offset-4"
            >
              Not quite
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <label htmlFor="correction" className="block text-sm text-ink">
              Tell me what I missed.
            </label>
            <textarea
              id="correction"
              autoFocus
              rows={2}
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              placeholder="It's less sad and more just tired of pretending"
              className="w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
            />
            <div className="flex gap-2">
              <Button variant="quiet" disabled={!correction.trim() || rechecking} onClick={() => onRecheck(correction)}>
                {rechecking ? "Reading again" : "Read it again"}
              </Button>
              <Button variant="ghost" onClick={() => setCorrecting(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-5 text-sm text-ink">Nudge anything that&rsquo;s off.</h3>
        <div className="grid gap-6 sm:grid-cols-2">
          {DIMENSION_META.map((d) => (
            <Slider
              key={d.key}
              label={d.label}
              value={profile.dimensions[d.key]}
              left={d.low}
              right={d.high}
              onChange={(n) =>
                onChange({ ...profile, dimensions: { ...profile.dimensions, [d.key]: n } })
              }
            />
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm text-ink">What should the music do?</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {IntentValues.map((key: Intent) => {
            const active = profile.intent === key;
            return (
              <button
                key={key}
                onClick={() => onChange({ ...profile, intent: key })}
                aria-pressed={active}
                className={`rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${
                  active
                    ? "border-accent bg-accent-soft"
                    : "border-line bg-surface hover:border-accent"
                }`}
              >
                <div className="text-sm text-ink">{INTENT_COPY[key].label}</div>
                <div className="mt-0.5 text-xs text-faint">{INTENT_COPY[key].blurb}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="text-sm text-ink">The sound</h3>
        <p className="mt-0.5 mb-3 text-sm text-faint">This is the brief the curator works from. Edit it freely.</p>
        <textarea
          value={profile.sonic_direction}
          onChange={(e) => onChange({ ...profile, sonic_direction: e.target.value })}
          rows={4}
          className="w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed outline-none focus:border-accent"
        />
      </section>
    </div>
  );
}
