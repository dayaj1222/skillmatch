import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

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
                <ProjectRow project={p} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ProjectRow({ project }: { project: Project }) {
  const spotsLeft = project.capacity - project.member_count;
  const full = spotsLeft <= 0;

  return (
    <Link to={`/projects/${project.id}`} className="row px-4 py-5">
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
  );
}
