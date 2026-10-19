import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "@phosphor-icons/react";

import { LevelTicks, SectionHead, SkeletonRows, StatusChip } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Project, Skill } from "../lib/types";

/**
 * Home.
 *
 * One argument, stated once: a project needs specific skills at specific
 * levels, and SkillMatch ranks people by how much of that they actually cover.
 * The hero is a dark drafting panel with one working instrument sitting on it;
 * everything below stays in the register language the rest of the app uses.
 */

/** Sample coverage. Explicitly an example, not a statistic. */
const SAMPLE = [
  { name: "React", need: 4, have: 5 },
  { name: "PostgreSQL", need: 3, have: 3 },
  { name: "FastAPI", need: 3, have: 2 },
  { name: "Figma", need: 2, have: 3 },
];

const STEPS = [
  {
    title: "Post the work",
    body: "Title, description, team size, and the skills it really needs — each with a minimum level.",
  },
  {
    title: "See who covers it",
    body: "Ranked by coverage, not keywords: what a person meets, what they are short on.",
  },
  {
    title: "Accept, and it exists",
    body: "Accepting an application creates membership. Capacity and one leader are enforced by the database.",
  },
];

export function HomePage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.projects({ open_only: true, limit: 50 }),
      api.skills().catch(() => [] as Skill[]),
    ])
      .then(([p, s]) => {
        if (cancelled) return;
        setProjects(p);
        setSkills(s);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The cloud is texture with a purpose: it shows the vocabulary is real.
  const topSkills = useMemo(
    () => [...skills].sort((a, b) => b.people - a.people).slice(0, 20),
    [skills],
  );

  const joinHref = user ? "/projects/new" : "/register";

  return (
    <div className="space-y-12">
      {/* --- Hero ------------------------------------------------------- */}
      <section className="relative overflow-hidden rounded-lg bg-ink text-inverse">
        <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative grid gap-10 p-7 sm:p-11 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-14 lg:p-14">
          <div>
            <p className="text-[0.8125rem] font-medium tracking-[0.01em] text-inverse/50">
              A team-finder for small projects
            </p>
            <h1 className="display mt-4 text-[clamp(2.5rem,5.6vw,4.25rem)] text-inverse">
              Find the people
              <br />
              who fit the work.
            </h1>
            <p className="mt-5 max-w-[46ch] text-[1.0625rem] text-inverse/65">
              Say what you are building and which skills it needs. SkillMatch shows exactly who
              covers that — and what is still missing — before anyone joins.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/search"
                className="btn h-11 bg-signal px-6 text-[0.9375rem] text-inverse hover:bg-signal/85"
              >
                Find people
                <ArrowRight size={15} weight="bold" />
              </Link>
              <Link
                to={joinHref}
                className="btn h-11 border border-inverse/25 px-6 text-[0.9375rem] text-inverse hover:border-inverse/60 hover:bg-inverse/10"
              >
                {user ? "Post a project" : "Create an account"}
              </Link>
            </div>

            <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-3 border-t border-inverse/15 pt-5">
              <div className="flex items-baseline gap-2">
                <dd className="tnum display text-[1.25rem] text-inverse">
                  {projects ? projects.length : "—"}
                </dd>
                <dt className="text-[0.8125rem] text-inverse/55">recruiting now</dt>
              </div>
              <div className="flex items-baseline gap-2">
                <dd className="tnum display text-[1.25rem] text-inverse">
                  {skills.length || "—"}
                </dd>
                <dt className="text-[0.8125rem] text-inverse/55">skills in the vocabulary</dt>
              </div>
            </dl>
          </div>

          <CoveragePanel />
        </div>
      </section>

      {/* --- Skill cloud ------------------------------------------------ */}
      {topSkills.length > 0 && (
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[0.8125rem] font-medium text-muted">
              What people are bringing
            </p>
            <Link
              to="/search"
              className="text-[0.8125rem] font-medium text-signal hover:underline"
            >
              Explore the directory
            </Link>
          </div>
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {topSkills.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/search?skill=${encodeURIComponent(s.name)}`}
                  className="chip hover:border-signal hover:text-signal"
                >
                  {s.name}
                  <span className="tnum ml-1.5 text-faint">{s.people}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- How it works ----------------------------------------------- */}
      <section>
        <SectionHead title="How it works" />
        <div className="mt-5 grid gap-px overflow-hidden rounded-md border border-rule bg-rule sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="bg-paper p-6">
              <span className="tnum text-[0.8125rem] text-faint">0{i + 1}</span>
              <p className="display mt-2 text-[1.1875rem]">{step.title}</p>
              <p className="mt-2 text-[0.9375rem] text-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* --- Recruiting now --------------------------------------------- */}
      <section>
        <SectionHead
          title="Recruiting now"
          meta={
            <Link to="/projects" className="hover:text-signal">
              See all projects
            </Link>
          }
        />
        {projects === null && <SkeletonRows rows={3} />}
        {projects && projects.length === 0 && (
          <p className="border-b border-rule py-6 text-[0.9375rem] text-muted">
            Nobody is recruiting right now. Post a project and see who turns up.
          </p>
        )}
        {projects && projects.length > 0 && (
          <ul className="border-t border-rule">
            {projects.slice(0, 3).map((p) => {
              const spots = Math.max(0, p.capacity - p.member_count);
              return (
                <li key={p.id}>
                  <Link to={`/projects/${p.id}`} className="row px-4 py-5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="display text-[1.1875rem]">{p.title}</span>
                      <StatusChip status={p.status} />
                      <span className="tnum ml-auto text-[0.8125rem] text-muted">
                        {spots === 0 ? "full" : `${spots} ${spots === 1 ? "spot" : "spots"} left`}
                      </span>
                    </div>
                    {p.description && (
                      <p className="mt-1.5 line-clamp-1 max-w-[80ch] text-[0.9375rem] text-muted">
                        {p.description}
                      </p>
                    )}
                    {p.required_skills.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {p.required_skills.slice(0, 6).map((s) => (
                          <span key={s.skill_id} className="chip text-muted">
                            {s.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* --- Closing ----------------------------------------------------- */}
      <section className="flex flex-wrap items-center justify-between gap-5 rounded-md bg-surface p-7">
        <div>
          <p className="display text-[1.375rem]">
            {user ? "Have something worth building?" : "Ready to find your people?"}
          </p>
          <p className="mt-1 max-w-[56ch] text-[0.9375rem] text-muted">
            A minute to register. Add your skills now, refine the levels whenever.
          </p>
        </div>
        <Link to={joinHref} className="btn btn-primary h-10 px-5">
          {user ? "Post a project" : "Join SkillMatch"}
        </Link>
      </section>
    </div>
  );
}

/**
 * The hero instrument: one person measured against one project's needs.
 * It is the product's whole argument in four rows, so it gets the space.
 * Sits on the dark panel as the only white surface — the eye lands here.
 */
function CoveragePanel() {
  const met = SAMPLE.filter((s) => s.have >= s.need).length;

  return (
    <div className="rounded-md bg-paper p-5 text-ink shadow-[0_18px_50px_-20px_rgb(0_0_0/0.55)] sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[0.8125rem] font-medium text-muted">Coverage</p>
          <p className="text-[0.75rem] text-faint">requirements met by one person</p>
        </div>
        <p className="tnum display text-[2rem] leading-none text-match">
          {met}
          <span className="text-[1.25rem] text-faint">/{SAMPLE.length}</span>
        </p>
      </div>

      <ul className="mt-5">
        {SAMPLE.map((s) => (
          <li
            key={s.name}
            className="flex items-center justify-between gap-3 border-b border-rule py-2.5 last:border-0"
          >
            <span className="text-[0.9375rem]">{s.name}</span>
            <span className="flex items-center gap-3">
              <LevelTicks level={s.have} />
              <span
                className={`w-8 text-right text-[0.75rem] font-medium ${
                  s.have >= s.need ? "text-match" : "text-gap"
                }`}
              >
                {s.have >= s.need ? "met" : "gap"}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-rule pt-3 text-[0.8125rem] text-muted">
        Ranked by coverage, not keywords.
      </p>
    </div>
  );
}
