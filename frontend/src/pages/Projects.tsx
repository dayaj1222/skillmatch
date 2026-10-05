import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Empty, ErrorNote, SkeletonRows, StatusChip } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Project, Skill } from "../lib/types";

/**
 * Projects, as a register.
 *
 * Each project is a ruled row, not a floating card: the rule separates records,
 * which is what a register does. The row inverts on hover. Capacity is the
 * loudest number on the row because capacity is what this app is about.
 */
export function ProjectsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const activeSkill = params.get("skill") ?? "";

  const [catalog, setCatalog] = useState<Skill[]>([]);
  const [projects, setProjects] = useState<Project[] | null>(null);
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
    api
      .projects({
        skill: activeSkill ? [activeSkill] : undefined,
        open_only: openOnly,
        limit: 50,
      })
      .then((r) => {
        if (!cancelled) {
          setProjects(r);
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
  }, [activeSkill, openOnly]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display max-w-[20ch] text-[clamp(2rem,5vw,3.25rem)]">
          Things people want to build
        </h1>
        {user && (
          <Link to="/projects/new" className="btn btn-primary">
            New project
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-6 border-y-3 border-rule py-4">
        <div className="min-w-[12rem]">
          <label htmlFor="skill-filter" className="field-label">
            Needs skill
          </label>
          <select
            id="skill-filter"
            className="field-input h-9"
            value={activeSkill}
            onChange={(e) => {
              const v = e.target.value;
              if (v) setParams({ skill: v });
              else setParams({});
            }}
          >
            <option value="">Any skill</option>
            {catalog.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <label className="flex h-9 cursor-pointer items-center gap-2 text-[0.8125rem] font-semibold uppercase tracking-[0.04em]">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)}
            className="h-4 w-4 accent-ink"
          />
          Recruiting only
        </label>

        {projects && !loading && (
          <span className="tnum ml-auto text-[0.8125rem] font-semibold uppercase tracking-[0.04em] text-muted">
            {projects.length} listed
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
        <ul className="border-t-3 border-rule">
          {projects.map((p) => (
            <li key={p.id}>
              <ProjectRow project={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectRow({ project }: { project: Project }) {
  const spotsLeft = project.capacity - project.member_count;

  return (
    <Link to={`/projects/${project.id}`} className="row px-4 py-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <span className="display text-[1.0625rem]">{project.title}</span>
            <StatusChip status={project.status} />
          </div>
          <p className="tnum row-dim mt-1 text-[0.75rem] uppercase tracking-[0.06em]">
            led by @{project.owner_username} / started{" "}
            {new Date(project.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </p>
          {project.description && (
            <p className="row-dim mt-2 line-clamp-2 max-w-[70ch] text-[0.875rem]">
              {project.description}
            </p>
          )}
          {project.required_skills.length > 0 && (
            <p className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.75rem] font-semibold uppercase tracking-[0.04em]">
              {project.required_skills.map((s) => (
                <span key={s.skill_id}>
                  {s.name}
                  <span className="tnum row-dim ml-1 opacity-70">L{s.min_level}+</span>
                </span>
              ))}
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <p className="tnum display text-[1.5rem] leading-none">
            {project.member_count}/{project.capacity}
          </p>
          <p className="tnum row-dim mt-1 text-[0.6875rem] uppercase tracking-[0.06em]">
            {project.status === "CLOSED"
              ? "closed"
              : `${spotsLeft} ${spotsLeft === 1 ? "spot" : "spots"} left`}
          </p>
        </div>
      </div>
    </Link>
  );
}
