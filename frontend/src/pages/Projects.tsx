import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LockOpen, LockSimple, Trash } from "@phosphor-icons/react";

import { Empty, ErrorNote, SectionHead, Select, SkeletonRows, StatusChip } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Project, Skill } from "../lib/types";

/**
 * Projects, as a register.
 *
 * Each project is a row, not a floating card: the rule separates records,
 * which is what a register does. The loudest number on the row is capacity —
 * how many people it still needs — because that is what the app is about.
 */
export function ProjectsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const activeSkill = params.get("skill") ?? "";

  const [catalog, setCatalog] = useState<Skill[]>([]);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [closedProjects, setClosedProjects] = useState<Project[]>([]);
  const [openOnly, setOpenOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .skills()
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.projects({
        skill: activeSkill ? [activeSkill] : undefined,
        open_only: openOnly,
        limit: 50,
      }),
      user ? api.projects({ open_only: false, limit: 100 }) : Promise.resolve([]),
    ])
      .then(([r, allProjects]) => {
        if (!cancelled) {
          setProjects(r);
          setClosedProjects(allProjects.filter((p) => p.owner_username === user?.username && p.status === "CLOSED"));
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load projects");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSkill, openOnly, user?.username]);

  const handleProjectUpdate = (updated: Project) => {
    if (updated.status === "CLOSED") {
      setProjects((all) => all?.filter((item) => item.id !== updated.id) ?? []);
      setClosedProjects((all) => [updated, ...all.filter((item) => item.id !== updated.id)]);
      return;
    }
    setClosedProjects((all) => all.filter((item) => item.id !== updated.id));
    const matchesSkill = !activeSkill || updated.required_skills.some((s) => s.name === activeSkill);
    const matchesOpenFilter = !openOnly || updated.status === "OPEN" || updated.status === "FORMING";
    if (matchesSkill && matchesOpenFilter) {
      setProjects((all) => all?.some((item) => item.id === updated.id)
        ? all.map((item) => item.id === updated.id ? updated : item)
        : [updated, ...(all ?? [])]);
    }
  };

  const handleProjectDelete = (deletedId: number) => {
    setProjects((all) => all?.filter((item) => item.id !== deletedId) ?? []);
    setClosedProjects((all) => all.filter((item) => item.id !== deletedId));
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display max-w-[20ch] text-[clamp(2rem,5vw,3rem)]">
            Things people want to build
          </h1>
          <p className="mt-2 max-w-[54ch] text-[0.9375rem] text-muted">
            Open projects looking for collaborators. Post one, or find one that needs what you
            have.
          </p>
        </div>
        {user && (
          <Link to="/projects/new" className="btn btn-primary">
            New project
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-4 border-y border-rule py-4">
        <div className="min-w-[12rem]">
          <label htmlFor="skill-filter" className="field-label">
            Needs skill
          </label>
          <Select
            id="skill-filter"
            className="h-9"
            value={activeSkill}
            onChange={(v) => {
              if (v) setParams({ skill: v });
              else setParams({});
            }}
            options={[
              { value: "", label: "Any skill" },
              ...catalog.map((s) => ({ value: s.name, label: s.name })),
            ]}
          />
        </div>

        <label className="flex h-9 cursor-pointer items-center gap-2 text-[0.875rem] font-medium text-ink">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)}
            className="h-4 w-4 accent-ink"
          />
          Recruiting only
        </label>

        {projects && !loading && (
          <span className="tnum ml-auto text-[0.875rem] text-muted">
            {projects.length} {projects.length === 1 ? "project" : "projects"}
          </span>
        )}
      </div>

      {error && <ErrorNote message={error} />}
      {loading && <SkeletonRows rows={4} />}

      {!loading && !error && projects && projects.length === 0 && (
        <Empty
          title="Nothing here"
          body={
            activeSkill
              ? `Nobody is recruiting for ${activeSkill} right now. Clear the filter to see everything.`
              : "Nobody has posted a project yet. If you have an idea, post it and see who turns up."
          }
          action={
            user ? (
              <Link to="/projects/new" className="btn btn-secondary">
                Post a project
              </Link>
            ) : (
              <Link to="/register" className="btn btn-secondary">
                Create an account
              </Link>
            )
          }
        />
      )}

      {!loading && projects && projects.length > 0 && (
        <div>
          <SectionHead title="Open projects" meta={`${projects.length} listed`} />
          <ul className="border-t border-rule">
            {projects.map((p) => (
              <li key={p.id}>
                <ProjectRow
                  project={p}
                  isOwner={user?.username === p.owner_username}
                  onUpdate={handleProjectUpdate}
                  onDelete={handleProjectDelete}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {user && !loading && (
        <section>
          <SectionHead title="Your closed projects" meta={`${closedProjects.length} ${closedProjects.length === 1 ? "project" : "projects"}`} />
          {closedProjects.length === 0 ? (
            <p className="py-4 text-sm text-muted">Projects you close will appear here. You can reopen or delete them anytime.</p>
          ) : (
            <ul className="border-t border-rule">
              {closedProjects.map((project) => (
                <li key={project.id}>
                  <ProjectRow project={project} isOwner onUpdate={handleProjectUpdate} onDelete={handleProjectDelete} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function ProjectRow({
  project,
  isOwner,
  onUpdate,
  onDelete,
}: {
  project: Project;
  isOwner: boolean;
  onUpdate: (project: Project) => void;
  onDelete: (id: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const spotsLeft = project.capacity - project.member_count;
  const full = spotsLeft <= 0;

  return (
    <div className="row flex flex-wrap items-stretch justify-between gap-3 px-4 py-5">
      <Link to={`/projects/${project.id}`} className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <span className="display text-[1.25rem]">{project.title}</span>
              <StatusChip status={project.status} />
            </div>
            <p className="mt-1 text-[0.8125rem] text-muted">
              Led by {project.owner_username} · started{" "}
              {new Date(project.created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </p>
            {project.description && (
              <p className="mt-2.5 line-clamp-2 max-w-[70ch] text-[0.9375rem] text-muted">
                {project.description}
              </p>
            )}
            {project.required_skills.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {project.required_skills.map((s) => (
                  <span key={s.skill_id} className="chip text-muted">
                    {s.name}
                    <span className="tnum ml-1.5 text-faint">L{s.min_level}+</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className={`tnum display text-[1.5rem] ${full ? "text-muted" : "text-ink"}`}>
              {project.member_count}/{project.capacity}
            </p>
            <p className="mt-1 text-[0.75rem] text-faint">
              {project.status === "CLOSED"
                ? "Closed"
                : full
                  ? "Full"
                  : `${spotsLeft} ${spotsLeft === 1 ? "spot" : "spots"} left`}
            </p>
          </div>
        </div>
      </Link>
      {isOwner && (
        <div className="flex shrink-0 items-start gap-2 sm:items-center">
          {project.status === "CLOSED" ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try { onUpdate(await api.reopen(project.id)); }
                catch (err) { setError(err instanceof Error ? err.message : "Could not reopen project"); }
                finally { setBusy(false); }
              }}
            >
              <LockOpen size={15} /> Reopen
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={async () => {
                if (!window.confirm(`Close “${project.title}”? It will stop appearing in recruiting results.`)) return;
                setBusy(true);
                setError(null);
                try { onUpdate(await api.close(project.id)); }
                catch (err) { setError(err instanceof Error ? err.message : "Could not close project"); }
                finally { setBusy(false); }
              }}
            >
              <LockSimple size={15} /> Close
            </button>
          )}
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(`Permanently delete “${project.title}”? This cannot be undone.`)) return;
              setBusy(true);
              setError(null);
              try { await api.deleteProject(project.id); onDelete(project.id); }
              catch (err) { setError(err instanceof Error ? err.message : "Could not delete project"); }
              finally { setBusy(false); }
            }}
          >
            <Trash size={15} /> Delete
          </button>
        </div>
      )}
      {error && <p className="w-full text-sm text-deny" role="alert">{error}</p>}
    </div>
  );
}
