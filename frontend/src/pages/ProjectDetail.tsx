import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Check, Crown, Door, X } from "@phosphor-icons/react";

import {
  Empty,
  ErrorNote,
  SectionTitle,
  SkeletonList,
  StatusChip,
  TimeAgo,
} from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Applicant, ProjectDetail } from "../lib/types";

/**
 * Project detail.
 *
 * The page renders differently by relationship: owner (review applicants,
 * manage the team), member (roster, post updates), outsider (apply). The
 * backend enforces these rules; this view only reflects them.
 */
export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const { user } = useAuth();
  const navigate = useNavigate();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(projectId)) return;
    try {
      setProject(await api.project(projectId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load project");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[760px]">
        <SkeletonList rows={4} />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="mx-auto max-w-[760px]">
        <ErrorNote message={error ?? "Project not found"} />
      </div>
    );
  }

  const isOwner = user?.id === project.owner_id;
  const isMember = Boolean(project.my_membership);
  const spotsLeft = project.capacity - project.member_count;

  return (
    <div className="mx-auto max-w-[760px] space-y-8">
      <div>
        <Link
          to="/projects"
          className="mb-3 inline-flex items-center gap-1 text-[0.8125rem] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          Projects
        </Link>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[1.5rem] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
            {project.title}
          </h1>
          <StatusChip status={project.status} />
        </div>
        <p className="tabular mt-1 text-[0.8125rem] text-[var(--color-ink-faint)]">
          led by{" "}
          <Link to={`/u/${project.owner_username}`} className="hover:text-[var(--color-accent)]">
            @{project.owner_username}
          </Link>{" "}
          · started <TimeAgo iso={project.created_at} /> · {project.member_count}/{project.capacity}{" "}
          members
          {project.status !== "CLOSED"
            ? ` · ${spotsLeft} ${spotsLeft === 1 ? "spot" : "spots"} left`
            : ""}
        </p>
      </div>

      {project.description && (
        <p className="max-w-[68ch] whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-[var(--color-ink-muted)]">
          {project.description}
        </p>
      )}

      {project.required_skills.length > 0 && (
        <div>
          <SectionTitle title="Needs" hint="Skills and the minimum level for each." />
          <div className="flex flex-wrap gap-2">
            {project.required_skills.map((s) => (
              <span
                key={s.skill_id}
                className="chip"
                style={{ background: "var(--color-sunken)", color: "var(--color-ink)" }}
              >
                {s.name}
                <span className="tabular text-[0.6875rem] text-[var(--color-ink-faint)]">
                  L{s.min_level}+
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {user && !isOwner && !isMember && !project.my_application && project.status !== "CLOSED" && (
        <ApplyForm projectId={projectId} onApplied={load} />
      )}

      {project.my_application && !isMember && (
        <div className="panel px-5 py-4">
          <p className="text-[0.875rem] text-[var(--color-ink)]">
            Your application is <strong>{project.my_application.status.toLowerCase()}</strong>.
          </p>
          {project.my_application.status === "PENDING" && (
            <button
              type="button"
              onClick={async () => {
                await api.withdraw(projectId);
                await load();
              }}
              className="btn btn-ghost mt-2 h-8 px-2"
            >
              Withdraw
            </button>
          )}
        </div>
      )}

      {!user && (
        <div className="panel px-5 py-4">
          <p className="text-[0.875rem] text-[var(--color-ink-muted)]">
            <Link to="/login" className="font-medium text-[var(--color-accent)] hover:underline">
              Sign in
            </Link>{" "}
            to apply for this project.
          </p>
        </div>
      )}

      {isOwner && project.applicants && (
        <div>
          <SectionTitle
            title="Applicants"
            hint={
              spotsLeft > 0
                ? `You can accept ${spotsLeft} more before the team is full.`
                : "The team is at capacity. Accepting more will be refused."
            }
          />
          {project.applicants.length === 0 ? (
            <Empty
              title="No applications yet"
              body="Nobody has asked to join. Sharing the project link or adding clearer required skills tends to help."
            />
          ) : (
            <ul className="space-y-2.5">
              {project.applicants.map((a) => (
                <ApplicantRow
                  key={a.application_id}
                  applicant={a}
                  projectId={projectId}
                  onDecided={load}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <SectionTitle title="Team" hint={isMember ? "You are on this team." : undefined} />
        <ul className="panel divide-y divide-[var(--color-line)]">
          {project.members.map((m) => (
            <li
              key={m.user_id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
            >
              <div className="flex items-center gap-2">
                {m.role === "LEADER" && <Crown size={14} weight="fill" color="var(--color-warn)" />}
                <Link
                  to={`/u/${m.username}`}
                  className="text-[0.9375rem] text-[var(--color-ink)] hover:text-[var(--color-accent)]"
                >
                  {m.username}
                </Link>
                {m.role === "LEADER" && (
                  <span className="text-[0.75rem] text-[var(--color-ink-faint)]">leader</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="tabular text-[0.75rem] text-[var(--color-ink-faint)]">
                  joined <TimeAgo iso={m.joined_at} />
                </span>
                {isOwner && m.user_id !== project.owner_id && project.status !== "CLOSED" && (
                  <button
                    type="button"
                    onClick={async () => {
                      await api.promote(projectId, m.username);
                      await load();
                    }}
                    className="btn btn-ghost h-7 px-2 text-[0.8125rem]"
                  >
                    Make leader
                  </button>
                )}
                {isMember && m.user_id === user?.id && m.role !== "LEADER" && (
                  <button
                    type="button"
                    onClick={async () => {
                      await api.leave(projectId);
                      navigate("/projects");
                    }}
                    className="btn btn-ghost h-7 px-2 text-[0.8125rem]"
                  >
                    <Door size={13} weight="regular" />
                    Leave
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {isOwner && project.status !== "CLOSED" && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                await api.close(projectId);
                await load();
              }}
              className="btn btn-secondary"
            >
              Close project
            </button>
            <Link to={`/projects/${projectId}/edit`} className="btn btn-ghost">
              Edit project
            </Link>
          </div>
        )}
      </div>

      <div>
        <SectionTitle title="Updates" hint={isMember ? undefined : "Posted by the team."} />

        {isMember && <UpdateComposer projectId={projectId} onPosted={load} />}

        {project.updates.length === 0 ? (
          <p className="text-[0.875rem] text-[var(--color-ink-muted)]">
            {isMember ? "No updates yet. Post the first one." : "No updates posted yet."}
          </p>
        ) : (
          <ul className="space-y-3">
            {project.updates.map((u) => (
              <li key={u.id} className="panel px-5 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    to={`/u/${u.author_username}`}
                    className="text-[0.8125rem] font-medium text-[var(--color-ink)] hover:text-[var(--color-accent)]"
                  >
                    @{u.author_username}
                  </Link>
                  <span className="tabular text-[0.75rem] text-[var(--color-ink-faint)]">
                    <TimeAgo iso={u.created_at} />
                  </span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-[var(--color-ink-muted)]">
                  {u.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ApplyForm({ projectId, onApplied }: { projectId: number; onApplied: () => void }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.apply(projectId, message);
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="panel space-y-3 p-5">
      <SectionTitle title="Apply to join" hint="Say what you would bring." />
      {error && <ErrorNote message={error} />}
      <div>
        <label htmlFor="apply-message" className="field-label">
          Your note
        </label>
        <textarea
          id="apply-message"
          rows={3}
          className="field-input"
          placeholder="I have built two Postgres-backed services and can take the schema work."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Sending..." : "Send application"}
        <ArrowRight size={14} weight="bold" />
      </button>
    </form>
  );
}

function ApplicantRow({
  applicant,
  projectId,
  onDecided,
}: {
  applicant: Applicant;
  projectId: number;
  onDecided: () => void;
}) {
  const [busy, setBusy] = useState<"ACCEPTED" | "REJECTED" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (status: "ACCEPTED" | "REJECTED") => {
    setBusy(status);
    setError(null);
    try {
      await api.decide(projectId, applicant.application_id, status);
      onDecided();
    } catch (err) {
      // The capacity trigger's message lands here verbatim.
      setError(err instanceof Error ? err.message : "Could not decide");
    } finally {
      setBusy(null);
    }
  };

  const decided = applicant.status !== "PENDING";

  return (
    <li className="panel px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Link
          to={`/u/${applicant.username}`}
          className="text-[0.9375rem] font-medium text-[var(--color-ink)] hover:text-[var(--color-accent)]"
        >
          {applicant.username}
        </Link>
        <span className="tabular text-[0.75rem] text-[var(--color-ink-faint)]">
          <TimeAgo iso={applicant.created_at} />
        </span>
      </div>

      {applicant.message && (
        <p className="mt-1.5 whitespace-pre-wrap text-[0.875rem] leading-relaxed text-[var(--color-ink-muted)]">
          {applicant.message}
        </p>
      )}

      {error && (
        <div className="mt-2">
          <ErrorNote message={error} />
        </div>
      )}

      {decided ? (
        <p
          className="mt-2 text-[0.8125rem] font-medium"
          style={{
            color:
              applicant.status === "ACCEPTED"
                ? "var(--color-affirm)"
                : applicant.status === "REJECTED"
                  ? "var(--color-deny)"
                  : "var(--color-ink-faint)",
          }}
        >
          {applicant.status.charAt(0) + applicant.status.slice(1).toLowerCase()}
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => decide("ACCEPTED")}
            disabled={busy !== null}
            className="btn btn-primary h-8"
          >
            <Check size={14} weight="bold" />
            {busy === "ACCEPTED" ? "Accepting..." : "Accept"}
          </button>
          <button
            type="button"
            onClick={() => decide("REJECTED")}
            disabled={busy !== null}
            className="btn btn-secondary h-8"
          >
            <X size={14} weight="bold" />
            {busy === "REJECTED" ? "Rejecting..." : "Reject"}
          </button>
        </div>
      )}
    </li>
  );
}

function UpdateComposer({ projectId, onPosted }: { projectId: number; onPosted: () => void }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.postUpdate(projectId, body);
      setBody("");
      onPosted();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="panel mb-4 space-y-3 p-4">
      <label htmlFor="update-body" className="field-label">
        Post an update
      </label>
      <textarea
        id="update-body"
        rows={2}
        className="field-input"
        placeholder="Schema is done, moving to the API layer this week."
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <button type="submit" className="btn btn-secondary" disabled={busy || !body.trim()}>
        {busy ? "Posting..." : "Post update"}
      </button>
    </form>
  );
}
