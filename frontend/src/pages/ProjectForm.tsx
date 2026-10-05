import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Trash } from "@phosphor-icons/react";

import { ErrorNote, SectionHead, SkeletonRows } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Skill } from "../lib/types";

interface DraftSkill {
  key: number;
  name: string;
  min_level: number;
}

/** Create a project, or edit an existing one when :id is present. */
export function ProjectFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const projectId = id ? Number(id) : null;

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState(4);
  const [skills, setSkills] = useState<DraftSkill[]>([]);
  const [catalog, setCatalog] = useState<Skill[]>([]);

  const [pendingName, setPendingName] = useState("");
  const [pendingLevel, setPendingLevel] = useState(3);

  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .skills()
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  // Edit mode: load the existing project into the form.
  useEffect(() => {
    if (!isEdit || projectId === null) return;
    api
      .project(projectId)
      .then((p) => {
        setTitle(p.title);
        setDescription(p.description);
        setCapacity(p.capacity);
        setSkills(
          p.required_skills.map((s, i) => ({
            key: i,
            name: s.name,
            min_level: s.min_level,
          })),
        );
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load project"))
      .finally(() => setLoading(false));
  }, [isEdit, projectId]);

  // Signed-out visitors are redirected before the form is usable. The API would
  // refuse anyway; this keeps the form off screen.
  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [authLoading, user, navigate]);

  const addSkill = () => {
    const name = pendingName.trim();
    if (!name) return;
    if (skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) return;
    setSkills((s) => [...s, { key: Date.now(), name, min_level: pendingLevel }]);
    setPendingName("");
    setPendingLevel(3);
  };

  const removeSkill = (key: number) => setSkills((s) => s.filter((x) => x.key !== key));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const payload = {
      title,
      description,
      capacity,
      skills: skills.map((s) => ({ name: s.name, min_level: s.min_level })),
    };
    try {
      if (isEdit && projectId !== null) {
        await api.updateProject(projectId, payload);
        navigate(`/projects/${projectId}`);
      } else {
        const created = await api.createProject(payload);
        navigate(`/projects/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[640px]">
        <SkeletonRows rows={3} />
      </div>
    );
  }

  const unused = catalog.filter(
    (s) => !skills.some((d) => d.name.toLowerCase() === s.name.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-[640px] space-y-6">
      <div>
        <h1 className="text-[1.5rem] font-semibold tracking-[-0.02em] text-ink">
          {isEdit ? "Edit project" : "New project"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Say what you are building, what skills it needs, and how many people you want.
        </p>
      </div>

      <form onSubmit={submit} className="border-3 border-rule space-y-5 p-5">
        {error && <ErrorNote message={error} />}

        <div>
          <label htmlFor="title" className="field-label">
            Title
          </label>
          <input
            id="title"
            className="field-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div>
          <label htmlFor="description" className="field-label">
            Description
          </label>
          <textarea
            id="description"
            rows={5}
            className="field-input"
            placeholder="What are you building, and what would a collaborator actually do?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="capacity" className="field-label">
            Team capacity
          </label>
          <input
            id="capacity"
            type="number"
            min={1}
            max={50}
            className="field-input w-[7rem]"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
          <p className="field-help">
            Including you. The database refuses any acceptance past this number.
          </p>
        </div>

        <div className="border-t border-rule pt-5">
          <SectionHead title="Required skills" meta="What you need, and at what level." />

          {skills.length > 0 && (
            <ul className="mb-4 divide-y divide-rule border-x-3 border-b-3 border-rule">
              {skills.map((s) => (
                <li key={s.key} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex-1 text-[0.9375rem] text-ink">{s.name}</span>
                  <label className="flex items-center gap-1.5 text-[0.8125rem] text-muted">
                    Min level
                    <select
                      className="field-input h-7 w-[4.5rem] px-1.5 text-[0.8125rem]"
                      value={s.min_level}
                      onChange={(e) =>
                        setSkills((all) =>
                          all.map((x) =>
                            x.key === s.key ? { ...x, min_level: Number(e.target.value) } : x,
                          ),
                        )
                      }
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeSkill(s.key)}
                    className="btn btn-danger h-7 w-7 px-0"
                    aria-label={`Remove ${s.name}`}
                  >
                    <Trash size={14} weight="regular" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem] flex-1">
              <label htmlFor="req-skill" className="field-label">
                Skill
              </label>
              <input
                id="req-skill"
                className="field-input"
                list="project-skill-catalog"
                placeholder="Postgres"
                value={pendingName}
                onChange={(e) => setPendingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill();
                  }
                }}
              />
              <datalist id="project-skill-catalog">
                {unused.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </div>
            <div>
              <label htmlFor="req-level" className="field-label">
                Min level
              </label>
              <select
                id="req-level"
                className="field-input w-[6rem]"
                value={pendingLevel}
                onChange={(e) => setPendingLevel(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} - {["Beginner", "Basic", "Competent", "Strong", "Expert"][n - 1]}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onClick={addSkill} className="btn btn-secondary">
              <Plus size={14} weight="bold" />
              Add
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-rule pt-5">
          <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>
            {busy ? "Saving..." : isEdit ? "Save changes" : "Create project"}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
