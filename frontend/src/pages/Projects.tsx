import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Empty, ErrorNote, SectionTitle, SkeletonList, StatusChip } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Project, Skill } from "../lib/types";

/** Browse projects, filter by required skill. */
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.5rem] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
            Projects
          </h1>
          <p className="mt-1 max-w-[58ch] text-sm text-[var(--color-ink-muted)]">
            Things people want to build. Apply with a note, and the owner decides who joins.
          </p>
        </div>
        {user && (
          <Link to="/projects/new" className="btn btn-primary">
            New project
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-[12rem]">
          <label htmlFor="skill-filter" className="field-label">
            Needs skill
          </label>
          <select
            id="skill-filter"
            className="field-input"
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

        <label className="flex h-9 cursor-pointer items-center gap-2 pt-5 text-[0.8125rem] text-[var(--color-ink)]">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          Recruiting only
        </label>
      </div>

      <div>
        <SectionTitle
          title="All projects"
          action={
            projects && !loading ? (
              <span className="tabular text-[0.8125rem] text-[var(--color-ink-faint)]">
                {projects.length}
              </span>
            ) : null
          }
        />

        {error && <ErrorNote message={error} />}
        {loading && <SkeletonList rows={4} />}

        {!loading && !error && projects && projects.length === 0 && (
          <Empty
            title="No projects here"
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
          <ul className="space-y-2.5">
            {projects.map((p) => (
              <ProjectRow key={p.id} project={p} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ProjectRow({ project }: { project: Project }) {
  const spotsLeft = project.capacity - project.member_count;

  return (
    <li className="panel px-5 py-4 transition-colors hover:border-[var(--color-line-strong)]">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <Link
              to={`/projects/${project.id}`}
              className="text-[0.9375rem] font-medium text-[var(--color-ink)] hover:text-[var(--color-accent)]"
            >
              {project.title}
            </Link>
            <StatusChip status={project.status} />
          </div>
          <p className="tabular mt-0.5 text-[0.75rem] text-[var(--color-ink-faint)]">
            led by @{project.owner_username}
          </p>
          {project.description && (
            <p className="mt-1.5 line-clamp-2 max-w-[65ch] text-[0.875rem] text-[var(--color-ink-muted)]">
              {project.description}
            </p>
          )}
          {project.required_skills.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
              {project.required_skills.map((s) => (
                <span key={s.skill_id} className="text-[0.8125rem] text-[var(--color-ink-muted)]">
                  {s.name}
                  <span className="tabular ml-1 text-[0.75rem] text-[var(--color-ink-faint)]">
                    L{s.min_level}+
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="tabular shrink-0 text-right text-[0.8125rem]">
          <p className="text-[var(--color-ink)]">
            {project.member_count}/{project.capacity} members
          </p>
          {project.status !== "CLOSED" && (
            <p className="text-[var(--color-ink-faint)]">
              {spotsLeft} {spotsLeft === 1 ? "spot" : "spots"} left
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
