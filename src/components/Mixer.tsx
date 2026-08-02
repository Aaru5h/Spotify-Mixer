"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Chip, ErrorNote, Slider, Spinner, ThemeToggle } from "./ui";
import TastePanel from "./TastePanel";
import MoodCard from "./MoodCard";
import TrackList from "./TrackList";
import { DEFAULT_TASTE, type MoodProfile, type ProbeResult, type ResolvedTrack, type Taste } from "@/lib/types";

type Stage = "write" | "probe" | "taste" | "mood" | "tracks" | "done";
type Playlist = { name: string; description: string; arc: string; tracks: ResolvedTrack[]; dropped: number };

const STAGES: Stage[] = ["write", "probe", "taste", "mood", "tracks"];

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong. Try again.");
  return json as T;
}

export default function Mixer({ initialError }: { initialError?: string }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState("you");

  const [stage, setStage] = useState<Stage>("write");
  const [note, setNote] = useState("");
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [taste, setTaste] = useState<Taste>(DEFAULT_TASTE);
  const [profile, setProfile] = useState<MoodProfile | null>(null);
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [savedUrl, setSavedUrl] = useState("");

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(initialError ?? "");
  const rejected = useRef<string[]>([]);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        setConnected(!!d.connected);
        setGenres(d.genres ?? []);
        if (d.displayName) setDisplayName(d.displayName);
      })
      .catch(() => setConnected(false));
  }, []);

  useEffect(() => {
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [stage]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const startProbe = () =>
    run("Reading what you wrote", async () => {
      const result = await post<ProbeResult>("/api/probe", { note });
      setProbe(result);
      // sliders start centred so the step can be completed by just continuing
      setAnswers(
        Object.fromEntries(result.questions.filter((q) => q.kind === "scale").map((q) => [q.id, "50"]))
      );
      setStage("probe");
    });

  const assess = (correction?: string) =>
    run("Working out where you are", async () => {
      const fullNote = correction ? `${note}\n\nThey then corrected me: "${correction}"` : note;
      const result = await post<MoodProfile>("/api/assess", {
        note: fullNote,
        questions: probe?.questions ?? [],
        answers,
        taste,
      });
      setProfile(result);
      setStage("mood");
    });

  const curate = (regenerate = false) =>
    run(regenerate ? "regenerating" : "Choosing the music", async () => {
      if (regenerate && playlist) {
        rejected.current.push(...playlist.tracks.map((t) => `${t.artist} — ${t.title}`));
      }
      const result = await post<Playlist>("/api/curate", {
        profile,
        taste,
        exclude: rejected.current.slice(-200),
      });
      setPlaylist(result);
      setStage("tracks");
    });

  const save = () =>
    run("saving", async () => {
      if (!playlist) return;
      const result = await post<{ url: string }>("/api/playlist", {
        name: playlist.name.trim() || "Untitled",
        description: playlist.description,
        uris: playlist.tracks.map((t) => t.uri),
        isPublic,
      });
      setSavedUrl(result.url);
      setStage("done");
    });

  const restart = () => {
    rejected.current = [];
    setNote("");
    setProbe(null);
    setAnswers({});
    setProfile(null);
    setPlaylist(null);
    setSavedUrl("");
    setTaste(DEFAULT_TASTE);
    setStage("write");
  };

  if (connected === null) {
    return <Shell><Spinner label="One moment" /></Shell>;
  }

  if (!connected) {
    return (
      <Shell>
        <div className="rise flex min-h-[70vh] flex-col justify-center">
          <p className="text-xs uppercase tracking-[0.18em] text-faint">Mood Mixer</p>
          <h1 className="display mt-4 text-5xl sm:text-6xl">
            Tell it how you are.
            <br />
            Get a playlist that fits.
          </h1>
          <p className="mt-6 max-w-md leading-relaxed text-muted">
            Write a little about your day. It asks a few questions, tells you what it thinks
            you&rsquo;re feeling, lets you correct it, then builds the playlist in your Spotify.
          </p>
          {error && <div className="mt-6 max-w-md"><ErrorNote>{error}</ErrorNote></div>}
          <div className="mt-9">
            <a href="/api/auth/login">
              <Button>Connect Spotify</Button>
            </a>
          </div>
          <p className="mt-4 text-xs text-faint">
            It reads your top artists to calibrate taste, and can create playlists. Nothing else.
          </p>
        </div>
      </Shell>
    );
  }

  const stepIndex = STAGES.indexOf(stage);

  return (
    <Shell name={displayName} onRestart={stage !== "write" ? restart : undefined}>
      <div ref={top} className="scroll-mt-8" />

      {stepIndex >= 0 && (
        <div className="mb-12 flex gap-1.5" aria-hidden>
          {STAGES.map((s, i) => (
            <span
              key={s}
              className={`h-0.5 flex-1 rounded-full transition-colors duration-500 ${
                i <= stepIndex ? "bg-accent" : "bg-line"
              }`}
            />
          ))}
        </div>
      )}

      {error && (
        <div className="mb-8">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {busy && !["regenerating", "saving"].includes(busy) ? (
        <Spinner label={busy} />
      ) : (
        <>
          {stage === "write" && (
            <section className="rise">
              <h1 className="display text-4xl sm:text-5xl">How are you, really?</h1>
              <p className="mt-4 max-w-prose leading-relaxed text-muted">
                Write it however it comes out. Half a sentence is fine; a paragraph is better.
                What happened today, what&rsquo;s sitting on you, what you want the next hour to feel like.
              </p>
              <textarea
                autoFocus
                rows={7}
                value={note}
                maxLength={4000}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Long day. Nothing went wrong exactly, I just feel scraped out and I don't want to talk to anyone…"
                className="mt-7 w-full resize-none rounded-3xl border border-line bg-surface px-5 py-4 leading-relaxed outline-none transition-colors placeholder:text-faint focus:border-accent"
              />
              <div className="mt-5 flex items-center gap-4">
                <Button onClick={startProbe} disabled={note.trim().length < 8}>
                  Continue
                </Button>
                <span className="text-xs text-faint">
                  {note.trim().length < 8 ? "A few more words" : "Nothing is stored after you close the tab"}
                </span>
              </div>
            </section>
          )}

          {stage === "probe" && probe && (
            <section className="rise">
              <h1 className="display text-3xl sm:text-4xl">{probe.opening_line}</h1>
              <p className="mt-3 text-sm text-faint">A few quick ones, then we&rsquo;re done.</p>

              <div className="mt-10 space-y-10">
                {probe.questions.map((q) => (
                  <div key={q.id}>
                    <h2 className="text-[1.05rem] text-ink">{q.question}</h2>
                    {q.hint && <p className="mt-1 text-sm text-faint">{q.hint}</p>}
                    <div className="mt-4">
                      {q.kind === "scale" && (
                        <Slider
                          value={Number(answers[q.id] ?? 50)}
                          onChange={(n) => setAnswers({ ...answers, [q.id]: String(n) })}
                          left={q.left_label}
                          right={q.right_label}
                        />
                      )}
                      {q.kind === "choice" && (
                        <div className="flex flex-wrap gap-2">
                          {q.options.map((o) => (
                            <Chip
                              key={o}
                              label={o}
                              active={answers[q.id] === o}
                              onClick={() =>
                                setAnswers({ ...answers, [q.id]: answers[q.id] === o ? "" : o })
                              }
                            />
                          ))}
                        </div>
                      )}
                      {q.kind === "text" && (
                        <textarea
                          rows={2}
                          value={answers[q.id] ?? ""}
                          onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                          className="w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-12 flex gap-3">
                <Button onClick={() => setStage("taste")}>Continue</Button>
                <Button variant="ghost" onClick={() => setStage("write")}>
                  Back
                </Button>
              </div>
            </section>
          )}

          {stage === "taste" && (
            <section className="rise">
              <h1 className="display text-3xl sm:text-4xl">Now the music itself.</h1>
              <p className="mt-3 max-w-prose text-muted">
                All optional. Skip it entirely and the playlist follows your mood alone.
              </p>
              <div className="mt-10">
                <TastePanel taste={taste} onChange={setTaste} genreSuggestions={genres} />
              </div>
              <div className="mt-12 flex gap-3">
                <Button onClick={() => assess()}>Read my mood</Button>
                <Button variant="ghost" onClick={() => setStage("probe")}>
                  Back
                </Button>
              </div>
            </section>
          )}

          {stage === "mood" && profile && (
            <section className="rise">
              <MoodCard
                profile={profile}
                onChange={setProfile}
                onRecheck={(c) => assess(c)}
                rechecking={busy === "Working out where you are"}
              />
              <div className="mt-12 flex gap-3">
                <Button onClick={() => curate()}>Build the playlist</Button>
                <Button variant="ghost" onClick={() => setStage("taste")}>
                  Back
                </Button>
              </div>
            </section>
          )}

          {stage === "tracks" && playlist && (
            <section className="rise">
              <TrackList
                {...playlist}
                isPublic={isPublic}
                busy={busy === "regenerating" ? "regenerating" : busy === "saving" ? "saving" : false}
                onName={(name) => setPlaylist({ ...playlist, name })}
                onPublic={setIsPublic}
                onRemove={(id) => {
                  const gone = playlist.tracks.find((t) => t.id === id);
                  if (gone) rejected.current.push(`${gone.artist} — ${gone.title}`);
                  setPlaylist({ ...playlist, tracks: playlist.tracks.filter((t) => t.id !== id) });
                }}
                onRegenerate={() => curate(true)}
                onCreate={save}
              />
              <div className="mt-8">
                <Button variant="ghost" onClick={() => setStage("mood")}>
                  Back to the mood
                </Button>
              </div>
            </section>
          )}

          {stage === "done" && playlist && (
            <section className="rise flex min-h-[60vh] flex-col justify-center">
              <p className="text-xs uppercase tracking-[0.18em] text-faint">Saved to Spotify</p>
              <h1 className="display mt-4 text-5xl sm:text-6xl">{playlist.name}</h1>
              <p className="mt-5 max-w-prose leading-relaxed text-muted">{playlist.description}</p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href={savedUrl} target="_blank" rel="noreferrer">
                  <Button>Open in Spotify</Button>
                </a>
                <Button variant="quiet" onClick={restart}>
                  Start again
                </Button>
              </div>
            </section>
          )}
        </>
      )}
    </Shell>
  );
}

function Shell({
  children,
  name,
  onRestart,
}: {
  children: React.ReactNode;
  name?: string;
  onRestart?: () => void;
}) {
  return (
    <main className="relative z-10 mx-auto min-h-dvh w-full max-w-2xl px-6 py-10 sm:px-8">
      <nav className="mb-16 flex items-center justify-between">
        <span className="text-sm text-faint">{name ? `Hello, ${name}` : "Mood Mixer"}</span>
        <div className="flex items-center gap-2">
          {onRestart && (
            <button onClick={onRestart} className="text-xs text-faint hover:text-ink">
              Start over
            </button>
          )}
          <ThemeToggle />
        </div>
      </nav>
      {children}
      <footer className="mt-24 border-t border-line pt-6 text-xs text-faint">
        Mood readings are a guess, not a diagnosis.
      </footer>
    </main>
  );
}
