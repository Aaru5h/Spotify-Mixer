"use client";

import { useState } from "react";
import { Button } from "./ui";
import type { ResolvedTrack } from "@/lib/types";

const mmss = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function TrackList({
  name,
  description,
  arc,
  tracks,
  dropped,
  isPublic,
  busy,
  canSave,
  onName,
  onPublic,
  onRemove,
  onRegenerate,
  onCreate,
}: {
  name: string;
  description: string;
  arc: string;
  tracks: ResolvedTrack[];
  dropped: number;
  isPublic: boolean;
  busy: false | "regenerating" | "saving";
  /** guests get a playlist on the shared account instead of their own */
  canSave: boolean;
  onName: (v: string) => void;
  onPublic: (v: boolean) => void;
  onRemove: (id: string) => void;
  onRegenerate: () => void;
  onCreate: () => void;
}) {
  const totalMs = tracks.reduce((a, t) => a + t.durationMs, 0);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = [name, "", ...tracks.map((t, i) => `${i + 1}. ${t.title} — ${t.artist}`)].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-faint">Your playlist</p>
        <input
          value={name}
          onChange={(e) => onName(e.target.value)}
          maxLength={100}
          aria-label="Playlist name"
          className="display mt-3 w-full bg-transparent text-4xl outline-none sm:text-5xl focus:text-accent transition-colors"
        />
        <p className="mt-4 max-w-prose leading-relaxed text-muted">{description}</p>
        {arc && <p className="mt-2 max-w-prose text-sm italic text-faint">{arc}</p>}
        <p className="mt-4 text-sm text-faint">
          {tracks.length} tracks · {Math.round(totalMs / 60000)} min
          {dropped > 0 && ` · ${dropped} suggestion${dropped > 1 ? "s" : ""} weren't on Spotify and were dropped`}
        </p>
      </header>

      {/* no dividers, just a hover wash — the way every track list reads now */}
      <ol className="-mx-3">
        {tracks.map((t, i) => (
          <li
            key={t.id}
            className="group flex items-start gap-4 rounded-lg px-3 py-3 transition-colors hover:bg-raised"
          >
            <span className="w-5 pt-1 text-right text-xs tabular-nums text-faint">{i + 1}</span>
            {t.art ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.art} alt="" width={44} height={44} className="mt-0.5 h-11 w-11 rounded object-cover" />
            ) : (
              <div className="mt-0.5 h-11 w-11 rounded bg-raised" />
            )}
            <div className="min-w-0 flex-1">
              <a
                href={t.url}
                target="_blank"
                rel="noreferrer"
                className="text-[0.95rem] text-ink hover:text-accent hover:underline underline-offset-4"
              >
                {t.title}
              </a>
              <div className="text-sm text-muted">{t.artist}</div>
              {t.reason && <p className="mt-1 max-w-prose text-sm italic leading-snug text-faint">{t.reason}</p>}
            </div>
            <span className="pt-1 text-xs tabular-nums text-faint">{mmss(t.durationMs)}</span>
            <button
              onClick={() => onRemove(t.id)}
              aria-label={`Remove ${t.title}`}
              className="pt-1 text-faint opacity-0 transition-opacity hover:text-accent focus-visible:opacity-100 group-hover:opacity-100"
            >
              ×
            </button>
          </li>
        ))}
      </ol>

      {canSave && (
      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => onPublic(e.target.checked)}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        Make it public on my profile
      </label>
      )}

      <div className="flex flex-wrap gap-3">
        <Button onClick={onCreate} disabled={!!busy || !tracks.length}>
          {busy === "saving"
            ? canSave ? "Saving to Spotify" : "Building it"
            : canSave ? "Save to Spotify" : "Open it in Spotify"}
        </Button>
        <Button variant="quiet" onClick={onRegenerate} disabled={!!busy}>
          {busy === "regenerating" ? "Rebuilding" : "Different tracks"}
        </Button>
        {!canSave && (
          <Button variant="quiet" onClick={copy} disabled={!tracks.length}>
            {copied ? "Copied" : "Copy the list"}
          </Button>
        )}
      </div>

      {!canSave && (
        <p className="text-sm leading-relaxed text-faint">
          You&rsquo;ll get a real Spotify playlist to open and play &mdash; tap the heart in
          Spotify to keep it.{" "}
          <a href="/api/auth/login" className="text-accent underline underline-offset-4">
            Connect Spotify
          </a>{" "}
          to have it saved into your own account instead.
        </p>
      )}
    </div>
  );
}
