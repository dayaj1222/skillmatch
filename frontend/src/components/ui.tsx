// Shared UI primitives.
//
// Every value here comes from a Tailwind utility tied to @theme in index.css.
// No hex codes, no font names, no radii are written in this file.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { ProjectStatus } from "../lib/types";

/** A ruled placeholder shaped like the content that will replace it. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-rule/15 ${className}`} />;
}

/** Skeleton rows matching the ruled register layout. */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="border-t-3 border-rule">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border-b-3 border-rule px-4 py-6">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="mt-3 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/**
 * Empty state: says what is missing and offers the action that fixes it.
 * Ruled and bordered so it reads as part of the register, not a floating card.
 */
export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-3 border-rule p-6">
      <p className="display text-base">{title}</p>
      <p className="mt-2 max-w-[58ch] text-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * A text field with a ruled menu of suggestions beneath it.
 *
 * Replaces <datalist>: its popup is drawn by the operating system (dark,
 * rounded, a purple highlight) and ignores every token in index.css. This
 * control is just the theme's input plus the theme's row, so it belongs.
 *
 * Typing filters the list; Enter takes the typed value or the highlighted
 * suggestion, whichever is active.
 */
export function SkillCombo({
  id,
  value,
  onChange,
  onCommit,
  options,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  options: { name: string; people?: number }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const pool = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;
    return pool.slice(0, 8);
  }, [options, value]);

  // Close when focus or a click leaves the control.
  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  const choose = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <input
        id={id}
        className="field-input"
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={`${id}-menu`}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (open && matches[active]) choose(matches[active].name);
            else onCommit();
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />

      {open && matches.length > 0 && (
        <ul className="combo-menu" id={`${id}-menu`} role="listbox">
          {matches.map((o, i) => (
            <li key={o.name} role="option" aria-selected={i === active}>
              <button
                type="button"
                className="combo-option"
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o.name)}
              >
                <span>{o.name}</span>
                {o.people !== undefined && <span className="combo-count">{o.people}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Inline error. Ruled, not a toast: this belongs next to the thing that failed. */
export function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="border-3 border-deny bg-deny/5 px-3 py-2 text-sm font-medium text-deny"
    >
      {message}
    </p>
  );
}

const STATUS_COLOR: Record<ProjectStatus, string> = {
  OPEN: "text-open",
  FORMING: "text-forming",
  ACTIVE: "text-active",
  CLOSED: "text-closed",
};

const STATUS_LABEL: Record<ProjectStatus, string> = {
  OPEN: "Open",
  FORMING: "Forming",
  ACTIVE: "Active",
  CLOSED: "Closed",
};

/** Status chip. Colour here encodes real lifecycle state, nothing else. */
export function StatusChip({ status }: { status: ProjectStatus }) {
  return <span className={`chip ${STATUS_COLOR[status]}`}>{STATUS_LABEL[status]}</span>;
}

/**
 * Level 1-5 as five ticks. Cheaper to scan down a column than the word "Level 4",
 * and it aligns under tabular figures.
 */
export function LevelTicks({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-[3px]" title={`Level ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`h-3 w-[3px] ${n <= level ? "bg-current" : "bg-current opacity-25"}`}
        />
      ))}
      <span className="sr-only">Level {level} of 5</span>
    </span>
  );
}

/**
 * Section heading: a black band with an uppercase display label.
 * This is a label for a real block of content, not an eyebrow decoration.
 */
export function SectionHead({ title, meta }: { title: string; meta?: ReactNode }) {
  return (
    <div className="section-head">
      <span>{title}</span>
      {meta && <span className="tnum text-[0.6875rem] tracking-normal">{meta}</span>}
    </div>
  );
}

/** Relative time, degrading to a date for anything older than a week. */
export function TimeAgo({ iso }: { iso: string }) {
  const then = new Date(iso);
  const seconds = Math.round((Date.now() - then.getTime()) / 1000);
  if (seconds < 60) return <>just now</>;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return <>{minutes}m ago</>;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return <>{hours}h ago</>;
  const days = Math.round(hours / 24);
  if (days < 7) return <>{days}d ago</>;
  return <>{then.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</>;
}
