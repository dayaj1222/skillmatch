// Shared UI primitives: states, chips, and small layout helpers.
//
// These exist so loading / empty / error states are consistent everywhere
// rather than re-invented per page (taste-skill Section 4.5).

import type { ReactNode } from "react";

import type { ProjectStatus } from "../lib/types";

/** A shimmering block shaped like the content that will replace it. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[var(--color-sunken)] ${className}`} />;
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="panel p-5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-3 h-3 w-2/3" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/**
 * Composed empty state: says what is missing and, where possible, what to do.
 * Not a lone grey sentence.
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
    <div className="panel flex flex-col items-start gap-3 px-6 py-10">
      <div className="space-y-1">
        <p className="text-[0.9375rem] font-medium text-[var(--color-ink)]">{title}</p>
        <p className="max-w-[52ch] text-sm text-[var(--color-ink-muted)]">{body}</p>
      </div>
      {action}
    </div>
  );
}

/** Inline error for forms and failed reads. Never a bare toast for these. */
export function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-[var(--radius-control)] border border-[var(--color-deny)]/25 bg-[var(--color-deny-wash)] px-3 py-2 text-sm text-[var(--color-deny)]"
    >
      {message}
    </p>
  );
}

const STATUS_STYLES: Record<ProjectStatus, { bg: string; fg: string; label: string }> = {
  OPEN: { bg: "var(--color-accent-wash)", fg: "var(--color-accent)", label: "Open" },
  FORMING: { bg: "var(--color-warn-wash)", fg: "var(--color-warn)", label: "Forming" },
  ACTIVE: { bg: "var(--color-affirm-wash)", fg: "var(--color-affirm)", label: "Active" },
  CLOSED: { bg: "var(--color-sunken)", fg: "var(--color-ink-muted)", label: "Closed" },
};

/** Status chip. Colour here conveys real lifecycle state, nothing decorative. */
export function StatusChip({ status }: { status: ProjectStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span className="chip" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}

/** Level 1-5 rendered as five ticks. Cheaper to scan than "Level 4". */
export function LevelTicks({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-[3px]" title={`Level ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className="h-[7px] w-[3px] rounded-full"
          style={{
            background: n <= level ? "var(--color-accent)" : "var(--color-line-strong)",
          }}
        />
      ))}
      <span className="sr-only">Level {level} of 5</span>
    </span>
  );
}

/** Section heading. Plain sentence case, no numbered eyebrow. */
export function SectionTitle({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <div>
        <h2 className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-[var(--color-ink)]">
          {title}
        </h2>
        {hint && <p className="mt-0.5 text-[0.8125rem] text-[var(--color-ink-muted)]">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/** Relative time that degrades to a date for anything older than a week. */
export function TimeAgo({ iso }: { iso: string }) {
  const then = new Date(iso);
  const now = Date.now();
  const seconds = Math.round((now - then.getTime()) / 1000);
  if (seconds < 60) return <span>just now</span>;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return <span>{minutes}m ago</span>;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return <span>{hours}h ago</span>;
  const days = Math.round(hours / 24);
  if (days < 7) return <span>{days}d ago</span>;
  return <span>{then.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>;
}
