import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "@phosphor-icons/react";

import { Empty, ErrorNote, LevelTicks, SectionHead, SkeletonRows } from "../components/ui";
import { api } from "../lib/api";
import type { PublicProfile, Skill } from "../lib/types";

/**
 * Find people.
 *
 * The backend ranks by coverage (matched / required), so the UI's job is to
 * make that ranking legible: every result shows which required skills the
 * person has and which they are short on, at the chosen minimum level.
 */
export function SearchPage() {
  const [catalog, setCatalog] = useState<Skill[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [minLevel, setMinLevel] = useState(1);
  const [requireAll, setRequireAll] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicProfile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    api
      .skills()
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  // Debounce so typing in the free-text box does not fire a request per key.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .search({
          skill: selected,
          min_level: minLevel,
          require_all: requireAll,
          q: query || undefined,
          limit: 40,
        })
        .then((r) => {
          if (!cancelled) {
            setResults(r);
            setError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Search failed");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [selected, minLevel, requireAll, query]);

  const available = useMemo(
    () => catalog.filter((s) => !selected.includes(s.name)),
    [catalog, selected],
  );

  const toggleSkill = (name: string) =>
    setSelected((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-[-0.02em] text-ink">
          Find people
        </h1>
        <p className="mt-1 max-w-[58ch] text-sm text-muted">
          Name the skills a project needs. Results rank by how many of them each person has at
          the level you ask for.
        </p>
      </div>

      <div className="border-3 border-rule space-y-5 p-5">
        <div>
          <label className="field-label">Required skills</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {selected.map((name) => (
              <span key={name} className="chip text-signal">
                {name}
                <button
                  type="button"
                  onClick={() => toggleSkill(name)}
                  aria-label={`Remove ${name}`}
                  className="opacity-60 hover:opacity-100"
                >
                  <X size={11} weight="bold" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              className="btn btn-secondary h-7 px-2.5 text-[0.8125rem]"
            >
              {selected.length === 0 ? "Add skills" : "Add another"}
            </button>
          </div>

          {pickerOpen && (
            <div className="mt-2 max-h-52 overflow-y-auto border-3 border-rule bg-paper p-2">
              {available.length === 0 ? (
                <p className="px-1 py-2 text-[0.8125rem] text-muted">
                  No more skills to add.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {available.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        toggleSkill(s.name);
                        setPickerOpen(false);
                      }}
                      className="border-3 border-rule px-2 py-1 text-[0.8125rem] text-ink hover:bg-ink hover:text-inverse"
                    >
                      {s.name}
                      <span className="tabular ml-1.5 text-[0.6875rem] text-faint">
                        {s.people}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-4 border-t border-rule pt-5 sm:grid-cols-3">
          <div>
            <label htmlFor="min-level" className="field-label">
              Minimum level
            </label>
            <select
              id="min-level"
              className="field-input"
              value={minLevel}
              onChange={(e) => setMinLevel(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} - {["Beginner", "Basic", "Competent", "Strong", "Expert"][n - 1]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="free-text" className="field-label">
              Free text
            </label>
            <input
              id="free-text"
              className="field-input"
              placeholder="Name, headline, bio"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="flex items-end">
            <label className="flex h-9 cursor-pointer items-center gap-2 text-[0.8125rem] text-ink">
              <input
                type="checkbox"
                checked={requireAll}
                onChange={(e) => setRequireAll(e.target.checked)}
                className="h-4 w-4 accent-ink"
              />
              Must have every skill
            </label>
          </div>
        </div>
      </div>

      <div>
        <SectionHead
          title={selected.length > 0 ? "Matches" : "Everyone"}
          meta={
            selected.length > 0
              ? `${selected.length} required${requireAll ? ", all" : ""}${
                  results && !loading ? ` / ${results.length} matched` : ""
                }`
              : results && !loading
                ? `${results.length} people`
                : undefined
          }
        />

        {error && <ErrorNote message={error} />}
        {loading && <SkeletonRows rows={3} />}

        {!loading && !error && results && results.length === 0 && (
          <Empty
            title={selected.length > 0 ? "Nobody matches yet" : "No profiles yet"}
            body={
              selected.length > 0
                ? "Nobody holds all of those skills at that level. Try lowering the minimum level, or untick the box to allow partial matches."
                : "Once people add skills to their profiles, they will appear here."
            }
          />
        )}

        {!loading && results && results.length > 0 && (
          <ul className="space-y-2.5">
            {results.map((p) => (
              <PersonRow key={p.id} person={p} required={selected} minLevel={minLevel} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PersonRow({
  person,
  required,
  minLevel,
}: {
  person: PublicProfile;
  required: string[];
  minLevel: number;
}) {
  // Coverage is computed client-side only for display. The ORDER of results is
  // the backend's decision, not ours.
  const byName = new Map(person.skills.map((s) => [s.name, s]));
  const held = required.filter((name) => {
    const s = byName.get(name);
    return s && s.level >= minLevel;
  });
  const missing = required.filter((name) => !held.includes(name));

  const meta = [person.branch, person.year ? `Year ${person.year}` : null, person.location]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="border-3 border-rule px-5 py-4 transition-colors hover:border-rule">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-2">
          <Link
            to={`/u/${person.username}`}
            className="text-[0.9375rem] font-medium text-ink hover:text-signal"
          >
            {person.full_name || person.username}
          </Link>
          <span className="tabular text-[0.8125rem] text-faint">
            @{person.username}
          </span>
        </div>
        {required.length > 0 && (
          <span
            className={`tnum text-[0.8125rem] font-medium ${
              held.length === required.length ? "text-active" : "text-forming"
            }`}
          >
            {held.length}/{required.length} skills
          </span>
        )}
      </div>

      {person.headline && (
        <p className="mt-0.5 text-[0.875rem] text-muted">{person.headline}</p>
      )}

      {meta && <p className="tabular mt-1 text-[0.75rem] text-faint">{meta}</p>}

      {person.skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {person.skills.slice(0, 8).map((s) => {
            const isRequired = required.includes(s.name);
            const counts = isRequired && s.level >= minLevel;
            return (
              <span
                key={s.skill_id}
                className={`inline-flex items-center gap-1.5 text-[0.8125rem] ${
                  isRequired ? (counts ? "text-ink" : "text-faint") : "text-muted"
                }`}
              >
                <LevelTicks level={s.level} />
                {s.name}
              </span>
            );
          })}
        </div>
      )}

      {missing.length > 0 && (
        <p className="mt-2.5 text-[0.75rem] text-faint">
          Short on: {missing.join(", ")}
        </p>
      )}
    </li>
  );
}
