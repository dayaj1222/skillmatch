import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Trash } from "@phosphor-icons/react";

import { ErrorNote, NumberInput, SectionHead, Select, SkillCombo, SkeletonRows } from "../components/ui";
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

  const addCatalogSkill = (name: string) => {
    if (skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) return;
    setSkills((s) => [...s, { key: Date.now() + s.length, name, min_level: pendingLevel }]);
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
      <div className="mx-auto max-w-[820px]">
        <SkeletonRows rows={3} />
      </div>
    );
  }

  const unused = catalog.filter(
    (s) => !skills.some((d) => d.name.toLowerCase() === s.name.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-[820px] space-y-6">
      <div>
        <h1 className="display text-[1.75rem]">
          {isEdit ? "Edit project" : "New project"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Say what you are building, what skills it needs, and how many people you want.
        </p>
      </div>

      <form onSubmit={submit} className="block space-y-5 p-5">
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
          <NumberInput
            id="capacity"
            min={1}
            max={50}
            className="w-[7rem]"
            value={capacity}
            onChange={setCapacity}
          />

        </div>

        <div className="border-t border-rule pt-5">
          <SectionHead title="Required skills" />

          {unused.length > 0 && (
            <div className="mb-4">
              <p className="field-label">Quick add from the catalog</p>
              <div className="flex flex-wrap gap-2">
                {unused.slice(0, 10).map((skill) => (
                  <button
                    key={skill.id}
                    type="button"
                    className="chip"
                    onClick={() => addCatalogSkill(skill.name)}
                  >
                    + {skill.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {skills.length > 0 && (
            <ul className="register mb-4 border-b border-rule">
              {skills.map((s) => (
                <li key={s.key} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex-1 text-[0.9375rem] text-ink">{s.name}</span>
                  <span className="flex items-center gap-1.5 text-[0.8125rem] text-muted">
                    Min level
                    <span className="w-[4.5rem]">
                      <Select
                        aria-label={`Minimum level for ${s.name}`}
                        className="h-7 px-1.5 text-[0.8125rem]"
                        value={String(s.min_level)}
                        onChange={(v) =>
                          setSkills((all) =>
                            all.map((x) =>
                              x.key === s.key ? { ...x, min_level: Number(v) } : x,
                            ),
                          )
                        }
                        options={[1, 2, 3, 4, 5].map((n) => ({
                          value: String(n),
                          label: String(n),
                        }))}
                      />
                    </span>
                  </span>
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
              <SkillCombo
                id="req-skill"
                placeholder="Postgres"
                value={pendingName}
                onChange={setPendingName}
                onCommit={addSkill}
                options={unused.map((s) => ({ name: s.name }))}
              />
            </div>
            <div>
              <label htmlFor="req-level" className="field-label">
                Min level
              </label>
              <Select
                id="req-level"
                className="w-[9rem]"
                value={String(pendingLevel)}
                onChange={(v) => setPendingLevel(Number(v))}
                options={[1, 2, 3, 4, 5].map((n) => ({
                  value: String(n),
                  label: `${["Beginner", "Basic", "Competent", "Strong", "Expert"][n - 1]} (${n})`,
                }))}
              />
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
