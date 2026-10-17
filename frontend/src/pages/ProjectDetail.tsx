import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, X } from "@phosphor-icons/react";

import {
  ErrorNote,
  SectionHead,
  SkeletonRows,
  StatusChip,
  TimeAgo,
} from "../components/ui";
import { UserPlus } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { relationTo } from "../lib/relation";
import type { Applicant, ProjectDetail } from "../lib/types";

/**
 * Project detail.
 *
 * Renders differently by relationship: owner (review applicants, run the team),
 * member (roster, post updates), outsider (apply). The backend enforces all of
 * these rules; this view only reflects them.
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
      <div className="mx-auto max-w-[1100px]">
        <SkeletonRows rows={4} />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="mx-auto max-w-[1100px]">
        <ErrorNote message={error ?? "Project not found"} />
      </div>
    );
  }

  const rel = relationTo(project, user);
  const { isLeader: isOwner, isMember, spotsLeft, pendingCount } = rel;

  return (
    <div className="mx-auto max-w-[1100px] space-y-10">
      <div>
        <Link
          to="/projects"
          className="mb-3 inline-block text-[0.8125rem] text-muted hover:text-ink"
        >
          All projects
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="display max-w-[24ch] text-[clamp(1.75rem,4vw,2.5rem)]">
                {project.title}
              </h1>
              <StatusChip status={project.status} />
            </div>
            <p className="tnum mt-2 text-[0.8125rem] text-muted">
              led by{" "}
              <Link to={`/u/${project.owner_username}`} className="underline hover:text-ink">
                @{project.owner_username}
              </Link>{" "}
              / started <TimeAgo iso={project.created_at} />
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="tnum display text-[2rem] leading-none">
              {project.member_count}/{project.capacity}
            </p>
            <p className="tnum mt-1 text-[0.8125rem] text-muted">
              {project.status === "CLOSED"
                ? "closed"
                : `${spotsLeft} ${spotsLeft === 1 ? "spot" : "spots"} left`}
            </p>
          </div>
        </div>
      </div>

      {project.description && (
        <p className="max-w-[70ch] whitespace-pre-wrap text-[0.9375rem] leading-relaxed">
          {project.description}
        </p>
      )}

      {project.required_skills.length > 0 && (
        <div>
          <SectionHead title="Needs" meta="minimum level shown" />
          <ul className="register border-b border-rule">
            {project.required_skills.map((s) => (
              <li
                key={s.skill_id}
                className="flex items-center justify-between px-4 py-3"
              >
                <span className="text-[0.9375rem] font-medium">{s.name}</span>
                <span className="tnum text-[0.8125rem] text-muted">
                  Level {s.min_level}+
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rel.canApply && <ApplyForm projectId={projectId} onApplied={load} />}

      {project.my_application && !isMember && project.my_application.status === "PENDING" && (
        <Invitation
          projectId={projectId}
          application={project.my_application}
          onChanged={load}
        />
      )}

      {project.my_application && !isMember && project.my_application.status !== "PENDING" && (
        <div className="block p-5">
          <p className="text-[0.875rem]">
            Your {project.my_application.initiated_by === "OWNER" ? "invitation" : "application"}{" "}
            is <strong className="font-semibold">{project.my_application.status.toLowerCase()}</strong>.
          </p>
        </div>
      )}

      {!user && (
        <div className="block p-5">
          <p className="text-[0.875rem] text-muted">
            <Link to="/login" className="font-bold underline hover:text-ink">
              Sign in
            </Link>{" "}
            to apply for this project.
          </p>
        </div>
      )}

      {rel.canSeeApplicants && project.applicants && (
        <div>
          <SectionHead
            title="Applicants"
            meta={
              spotsLeft > 0
                ? `${pendingCount} pending / ${spotsLeft} can be accepted`
                : `${pendingCount} pending / team full`
            }
          />
          {project.applicants.length === 0 ? (
            <div className="block p-6">
              <p className="display text-base">No applications yet</p>
              <p className="mt-2 max-w-[58ch] text-sm text-muted">
                Nobody has asked to join. Clearer required skills tend to help.
              </p>
            </div>
          ) : (
            <ul className="register border-b border-rule">
              {project.applicants.map((a) => (
                <li key={a.application_id}>
                  <ApplicantRow applicant={a} projectId={projectId} onDecided={load} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <SectionHead title="Team" meta={isMember ? "you are on this team" : undefined} />
        <ul className="register border-b border-rule">
          {project.members.map((m) => (
            <li
              key={m.user_id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
            >
              <div className="flex items-center gap-2.5">
                <Link
                  to={`/u/${m.username}`}
                  className="text-[0.9375rem] font-medium hover:underline"
                >
                  {m.username}
                </Link>
                <span className="chip text-muted">{m.role === "LEADER" ? "Leader" : "Member"}</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="tnum text-[0.8125rem] text-faint">
                  joined <TimeAgo iso={m.joined_at} />
                </span>
                {isOwner && m.user_id !== project.owner_id && project.status !== "CLOSED" && (
                  <button
                    type="button"
                    onClick={async () => {
                      await api.promote(projectId, m.username);
                      await load();
                    }}
                    className="btn btn-ghost h-7 px-2 text-[0.6875rem]"
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
                    className="btn btn-ghost h-7 px-2 text-[0.6875rem]"
                  >
                    Leave
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {isOwner && project.status !== "CLOSED" && (
          <div className="mt-4 flex flex-wrap gap-2">
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

        {isOwner && project.status !== "CLOSED" && spotsLeft > 0 && (
          <InviteForm projectId={projectId} onInvited={load} />
        )}
      </div>

      <div>
        <SectionHead title="Updates" meta={isMember ? "you can post" : undefined} />

        {isMember && <UpdateComposer projectId={projectId} onPosted={load} />}

        {project.updates.length === 0 ? (
          <div className="block p-6">
            <p className="text-sm text-muted">
              {isMember ? "No updates yet. Post the first one." : "No updates posted yet."}
            </p>
          </div>
        ) : (
          <ul className="register border-b border-rule">
            {project.updates.map((u) => (
              <li key={u.id} className="px-4 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    to={`/u/${u.author_username}`}
                    className="text-[0.8125rem] font-medium hover:underline"
                  >
                    @{u.author_username}
                  </Link>
                  <span className="tnum text-[0.8125rem] text-faint">
                    <TimeAgo iso={u.created_at} />
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[0.9375rem] leading-relaxed">
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

/**
 * A pending row on the project, from the recipient's point of view.
 * An owner-initiated row is an invitation to accept; an applicant-initiated
 * row is their own application, which only the owner can decide.
 */
function Invitation({
  projectId,
  application,
  onChanged,
}: {
  projectId: number;
  application: Applicant;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<"ACCEPTED" | "REJECTED" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const invited = application.initiated_by === "OWNER";

  const decide = async (status: "ACCEPTED" | "REJECTED") => {
    setBusy(status);
    setError(null);
    try {
      await api.decide(projectId, application.application_id, status);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not respond");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="block p-5">
      {error && <ErrorNote message={error} />}
      <p className="text-[0.875rem]">
        {invited ? (
          <>
            You were <strong className="font-semibold">invited</strong> to this project.
          </>
        ) : (
          <>
            Your application is <strong className="font-semibold">pending</strong>.
          </>
        )}
      </p>

      {invited ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => decide("ACCEPTED")}
            disabled={busy !== null}
            className="btn btn-primary h-8"
          >
            <Check size={14} weight="bold" />
            {busy === "ACCEPTED" ? "Joining" : "Accept invite"}
          </button>
          <button
            type="button"
            onClick={() => decide("REJECTED")}
            disabled={busy !== null}
            className="btn btn-secondary h-8"
          >
            {busy === "REJECTED" ? "Declining" : "Decline"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={async () => {
            await api.withdraw(projectId);
            await onChanged();
          }}
          className="btn btn-ghost mt-3 h-8 px-2"
        >
          Withdraw
        </button>
      )}
    </div>
  );
}

function InviteForm({ projectId, onInvited }: { projectId: number; onInvited: () => void }) {
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = username.trim().replace(/^@/, "");
    if (!name) return;
    setError(null);
    setSent(null);
    setBusy(true);
    try {
      await api.invite(projectId, name, message);
      setSent(name);
      setUsername("");
      setMessage("");
      onInvited();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the invite");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 block p-4">
      <SectionHead title="Invite someone" meta="They get a pending request" />
      <div className="mt-4 space-y-4">
        {error && <ErrorNote message={error} />}
        {sent && (
          <p className="rounded-sm border border-active px-3 py-2 text-sm font-medium text-active">
            Invited @{sent}. It is waiting in their dashboard.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="invite-username" className="field-label">
              Username
            </label>
            <input
              id="invite-username"
              className="field-input"
              placeholder="bob"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="invite-message" className="field-label">
              Note (optional)
            </label>
            <input
              id="invite-message"
              className="field-input"
              placeholder="You would be great for the schema work."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy || !username.trim()}>
          <UserPlus size={14} weight="bold" />
          {busy ? "Sending" : "Send invite"}
        </button>
      </div>
    </form>
  );
}

function ApplyForm({ projectId, onApplied }: { projectId: number; onApplied: () => void }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [match, setMatch] = useState<{ matched: string[]; missing: string[]; below_level: string[] } | null>(null);

  const doApply = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.apply(projectId, message);
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply");
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const m = await api.skillMatch(projectId);
      setMatch(m);
      if ((m.missing?.length ?? 0) > 0 || (m.below_level?.length ?? 0) > 0) {
        setConfirmOpen(true);
      } else {
        await doApply();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check skills");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <form onSubmit={submit} className="block p-5">
      <SectionHead title="Apply to join" />
      <div className="mt-4 space-y-4">
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
          {busy ? "Sending" : "Send application"}
        </button>
      </div>
    </form>

    {confirmOpen && match && (
      <div className="skill-modal-backdrop" role="dialog" aria-modal="true">
        <div className="skill-modal animate-pop">
          <h2 className="display text-[1.4rem]">Skills not matched</h2>
          <p className="mt-2 text-[0.875rem] text-muted">
            You are missing or below the required level for some skills. You can still apply; the owner will see this.
          </p>
          {match.missing.length > 0 && (
            <p className="mt-2 text-[0.875rem]">Missing: {match.missing.join(", ")}</p>
          )}
          {match.below_level.length > 0 && (
            <p className="mt-2 text-[0.875rem]">Below level: {match.below_level.join(", ")}</p>
          )}
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void doApply()}>
              {busy ? "Sending" : "Apply anyway"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
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
      setError(err instanceof Error ? err.message : "Could not decide");
    } finally {
      setBusy(null);
    }
  };

  const decided = applicant.status !== "PENDING";

  return (
    <div className="px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Link
          to={`/u/${applicant.username}`}
          className="text-[0.9375rem] font-medium hover:underline"
        >
          {applicant.username}
        </Link>
        <span className="tnum text-[0.8125rem] text-faint">
          <TimeAgo iso={applicant.created_at} />
        </span>
      </div>

      {applicant.message && (
        <p className="mt-2 whitespace-pre-wrap text-[0.875rem] leading-relaxed text-muted">
          {applicant.message}
        </p>
      )}

      {error && (
        <div className="mt-3">
          <ErrorNote message={error} />
        </div>
      )}

      {decided ? (
        <p className="mt-3 text-[0.8125rem] capitalize text-faint">
          {applicant.status.toLowerCase()}
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
            {busy === "ACCEPTED" ? "Accepting" : "Accept"}
          </button>
          <button
            type="button"
            onClick={() => decide("REJECTED")}
            disabled={busy !== null}
            className="btn btn-secondary h-8"
          >
            <X size={14} weight="bold" />
            {busy === "REJECTED" ? "Rejecting" : "Reject"}
          </button>
        </div>
      )}
    </div>
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
    <form onSubmit={submit} className="mb-4 block p-4">
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
      <button type="submit" className="btn btn-secondary mt-3" disabled={busy || !body.trim()}>
        {busy ? "Posting" : "Post update"}
      </button>
    </form>
  );
}
