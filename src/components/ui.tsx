"use client";

import { useEffect, useState, type ReactNode } from "react";

export function Button({
  children,
  onClick,
  variant = "solid",
  disabled,
  type = "button",
  full,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "solid" | "quiet" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
  full?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[0.95rem] font-medium transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none";
  const styles = {
    solid: "bg-accent text-accent-ink hover:brightness-110 active:scale-[0.98] shadow-sm",
    quiet: "border border-line bg-surface text-ink hover:bg-raised active:scale-[0.98]",
    ghost: "text-muted hover:text-ink px-3",
  }[variant];

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles} ${full ? "w-full" : ""}`}>
      {children}
    </button>
  );
}

export function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-4 py-2 text-sm transition-all duration-200 active:scale-95 ${
        active
          ? "border-accent bg-accent text-accent-ink"
          : "border-line bg-surface text-muted hover:border-accent hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

export function Slider({
  value,
  onChange,
  left,
  right,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  left: string;
  right: string;
  label?: string;
}) {
  return (
    <div>
      {label && <div className="mb-2 text-sm text-ink">{label}</div>}
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        aria-label={label ?? `${left} to ${right}`}
        aria-valuetext={`${value} of 100, between ${left} and ${right}`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="mt-1 flex justify-between text-xs text-faint">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

/** Free-text tag entry. Enter or comma commits; backspace on empty removes last. */
export function TagInput({
  values,
  onChange,
  placeholder,
  suggestions = [],
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const v = raw.trim().replace(/,$/, "");
    if (!v || values.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    onChange([...values, v]);
  };

  const unused = suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2.5 focus-within:border-accent transition-colors">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-sm text-ink"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              aria-label={`Remove ${v}`}
              className="text-faint hover:text-accent leading-none"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          placeholder={values.length ? "" : placeholder}
          onChange={(e) => {
            if (e.target.value.endsWith(",")) {
              add(e.target.value);
              setDraft("");
            } else setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
              setDraft("");
            } else if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => {
            add(draft);
            setDraft("");
          }}
          className="min-w-[8rem] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-faint"
        />
      </div>
      {unused.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {unused.slice(0, 8).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-full border border-line px-2.5 py-1 text-xs text-faint transition-colors hover:border-accent hover:text-ink"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center" role="status" aria-live="polite">
      <div className="flex gap-1.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="breathe h-1.5 w-1.5 rounded-full bg-accent"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as "light" | "dark") ?? "light");
  }, []);

  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("mm-theme", next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink"
    >
      {theme === "dark" ? "Dim room" : "Paper"}
    </button>
  );
}

export function ErrorNote({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-line bg-accent-soft px-5 py-4 text-sm text-ink"
    >
      <p>{children}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 underline underline-offset-4 hover:text-accent">
          Try again
        </button>
      )}
    </div>
  );
}
