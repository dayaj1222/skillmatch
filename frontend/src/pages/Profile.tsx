import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Plus, SealCheck, Trash } from "@phosphor-icons/react";

import { Empty, ErrorNote, LevelTicks, SectionHead, SkeletonRows } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Profile, ProfileSkill, PublicProfile, Skill } from "../lib/types";

/**
 * Profile page.
 *
 * Doubles as the public view and the owner's editor. The owner sees an edit
 * toggle; everyone else sees a read-only page they can endorse skills on. Same
 * layout either way so people recognise their own page when they meet it in
 * public.
 */
export function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const isMe = user?.username === username;

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [mine, setMine] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!username) return;
    setLoading(true);
    try {
      const pub = await api.publicProfile(username);
      setProfile(pub);
      if (isMe) setMine(await api.myProfile());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load profile");
    } finally {
      setLoading(false);
    }
  }, [username, isMe]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[720px]">
        <SkeletonRows rows={3} />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-[720px]">
        <ErrorNote message={error ?? "Profile not found"} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px] space-y-8">
      <ProfileHeader
        profile={profile}
        isMe={isMe}
        editing={editing}
        onToggleEdit={() => setEditing((e) => !e)}
      />

      {isMe && editing && mine ? (
        <EditProfile profile={mine} onSaved={load} />
      ) : (
        <ReadOnlyProfile profile={profile} isMe={isMe} onChanged={load} />
      )}
    </div>
  );
}

function ProfileHeader({
  profile,
  isMe,
  editing,
  onToggleEdit,
}: {
  profile: PublicProfile;
  isMe: boolean;
  editing: boolean;
  onToggleEdit: () => void;
}) {
  const meta = [profile.branch, profile.year ? `Year ${profile.year}` : null, profile.location]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="display text-[1.75rem]">
          {profile.full_name || profile.username}
        </h1>
        <p className="tnum mt-0.5 text-[0.8125rem] text-faint">
          @{profile.username}
          {meta ? ` · ${meta}` : ""}
        </p>
        {profile.headline && (
          <p className="mt-2 max-w-[60ch] text-[0.9375rem] text-muted">
            {profile.headline}
          </p>
        )}
        {profile.contact_link && (
          <a
            href={profile.contact_link}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-block text-[0.8125rem] font-medium text-signal hover:underline"
          >
            Contact
          </a>
        )}
      </div>

      {isMe && (
        <button type="button" onClick={onToggleEdit} className="btn btn-secondary">
          {editing ? "Done editing" : "Edit profile"}
        </button>
      )}
    </div>
  );
}

/** Public, read-only view: bio, skills with endorsement counts, endorsing. */
function ReadOnlyProfile({
  profile,
  isMe,
  onChanged,
}: {
  profile: PublicProfile;
  isMe: boolean;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-8">
      {profile.bio && (
        <div>
          <SectionHead title="Background" />
          <p className="max-w-[65ch] whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-muted">
            {profile.bio}
          </p>
        </div>
      )}

      <div>
        <SectionHead
          title="Skills"
          meta={
            isMe
              ? "Counts show how many people vouched for each skill."
              : "Vouch for a skill you have seen them use."
          }
        />
        {profile.skills.length === 0 ? (
          <Empty
            title={isMe ? "No skills listed yet" : "No skills listed"}
            body={
              isMe
                ? "Add skills so people searching for collaborators can find you. A profile with no skills never appears in a search."
                : "This person has not added any skills yet."
            }
            action={
              isMe ? (
                <Link to={`/u/${profile.username}`} className="btn btn-secondary">
                  Add skills
                </Link>
              ) : null
            }
          />
        ) : (
          <ul className="border-x-3 border-b-3 border-rule">
            {profile.skills.map((s) => (
              <SkillRow
                key={s.skill_id}
                skill={s}
                username={profile.username}
                canEndorse={!isMe}
                onChanged={onChanged}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SkillRow({
  skill,
  username,
  canEndorse,
  onChanged,
}: {
  skill: ProfileSkill;
  username: string;
  canEndorse: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [endorsed, setEndorsed] = useState(false);
  const [count, setCount] = useState(skill.endorsements);

  // The API is idempotent, so "endorsed" here is optimistic UI state, not a
  // server-verified flag. Reloading re-derives it from the real count.
  const toggle = async () => {
    setBusy(true);
    const next = !endorsed;
    try {
      if (next) await api.endorse(username, skill.skill_id);
      else await api.unendorse(username, skill.skill_id);
      setEndorsed(next);
      setCount((c) => c + (next ? 1 : -1));
      onChanged();
    } catch {
      /* keep the optimistic state; a reload reconciles it */
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <LevelTicks level={skill.level} />
        <span className="text-[0.9375rem] text-ink">{skill.name}</span>
        {skill.category && (
          <span className="text-[0.75rem] text-faint">{skill.category}</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {skill.years > 0 && (
          <span className="tnum text-[0.8125rem] text-faint">
            {skill.years} {skill.years === 1 ? "yr" : "yrs"}
          </span>
        )}
        <span className="tnum flex items-center gap-1 text-[0.8125rem] text-muted">
          <SealCheck
            size={14}
            weight={count > 0 ? "fill" : "regular"}
            className={count > 0 ? "text-active" : "text-faint"}
          />
          {count}
        </span>
        {canEndorse && (
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            className="btn btn-ghost h-7 px-2 text-[0.8125rem]"
          >
            {endorsed ? "Endorsed" : "Endorse"}
          </button>
        )}
      </div>
    </li>
  );
}

/** Owner's editor: profile fields plus the canonical skill picker. */
function EditProfile({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const { user } = useAuth();
  const [form, setForm] = useState(profile);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    setSaved(false);
    try {
      await api.updateProfile({
        full_name: form.full_name,
        headline: form.headline,
        branch: form.branch,
        year: form.year,
        location: form.location,
        bio: form.bio,
        contact_link: form.contact_link,
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <form onSubmit={submit} className="border-3 border-rule space-y-4 p-5">
        <SectionHead title="Your details" meta="Shown on your public profile." />
        {error && <ErrorNote message={error} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="full_name" className="field-label">
              Full name
            </label>
            <input
              id="full_name"
              className="field-input"
              value={form.full_name ?? ""}
              onChange={(e) => set("full_name", e.target.value || null)}
            />
          </div>
          <div>
            <label htmlFor="headline" className="field-label">
              Headline
            </label>
            <input
              id="headline"
              className="field-input"
              placeholder="Backend developer, likes data models"
              value={form.headline ?? ""}
              onChange={(e) => set("headline", e.target.value || null)}
            />
          </div>
          <div>
            <label htmlFor="branch" className="field-label">
              Branch
            </label>
            <input
              id="branch"
              className="field-input"
              placeholder="CSE"
              value={form.branch ?? ""}
              onChange={(e) => set("branch", e.target.value || null)}
            />
          </div>
          <div>
            <label htmlFor="year" className="field-label">
              Year
            </label>
            <input
              id="year"
              type="number"
              min={1}
              max={8}
              className="field-input"
              value={form.year ?? ""}
              onChange={(e) => set("year", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div>
            <label htmlFor="location" className="field-label">
              Location
            </label>
            <input
              id="location"
              className="field-input"
              value={form.location ?? ""}
              onChange={(e) => set("location", e.target.value || null)}
            />
          </div>
          <div>
            <label htmlFor="contact_link" className="field-label">
              Contact link
            </label>
            <input
              id="contact_link"
              className="field-input"
              placeholder="https://github.com/you"
              value={form.contact_link ?? ""}
              onChange={(e) => set("contact_link", e.target.value || null)}
            />
            <p className="field-help">Where people reach you. Email is never shown.</p>
          </div>
        </div>

        <div>
          <label htmlFor="bio" className="field-label">
            Background
          </label>
          <textarea
            id="bio"
            rows={4}
            className="field-input"
            value={form.bio ?? ""}
            onChange={(e) => set("bio", e.target.value || null)}
          />
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save details"}
          </button>
          {saved && <span className="text-[0.8125rem] text-active">Saved.</span>}
        </div>
      </form>

      {user && <SkillEditor onSaved={onSaved} />}
    </div>
  );
}

/** Canonical skill picker with level and years per skill. */
function SkillEditor({ onSaved }: { onSaved: () => void }) {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState<Skill[]>([]);
  const [current, setCurrent] = useState<ProfileSkill[]>([]);
  const [pendingName, setPendingName] = useState("");
  const [pendingLevel, setPendingLevel] = useState(3);
  const [pendingYears, setPendingYears] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .skills()
      .then(setCatalog)
      .catch(() => setCatalog([]));
    if (user) {
      api
        .publicProfile(user.username)
        .then((p) => setCurrent(p.skills))
        .catch(() => setCurrent([]));
    }
  }, [user]);

  const add = () => {
    const name = pendingName.trim();
    if (!name) return;
    if (current.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      setError(`You already list ${name}.`);
      return;
    }
    setError(null);
    setCurrent((c) => [
      ...c,
      {
        skill_id: -Date.now(), // temporary key; real id assigned on save
        name,
        category: null,
        level: pendingLevel,
        years: pendingYears,
        endorsements: 0,
      },
    ]);
    setPendingName("");
    setPendingLevel(3);
    setPendingYears(0);
  };

  const remove = (skillId: number) => setCurrent((c) => c.filter((s) => s.skill_id !== skillId));

  const persist = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.setSkills(current.map((s) => ({ name: s.name, level: s.level, years: s.years })));
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save skills");
    } finally {
      setSaving(false);
    }
  };

  const unused = catalog.filter(
    (s) => !current.some((c) => c.name.toLowerCase() === s.name.toLowerCase()),
  );

  return (
    <div className="border-3 border-rule p-5">
      <SectionHead
        title="Skills"
        meta="Pick from the shared list so two people typing the same skill get one entry."
      />
      {error && <ErrorNote message={error} />}

      {current.length === 0 ? (
        <p className="mb-4 text-[0.875rem] text-muted">
          You have not added any skills yet. Search ranks people by these, so a profile without
          skills is invisible to search.
        </p>
      ) : (
        <ul className="mb-4 divide-y divide-rule border-x-3 border-b-3 border-rule">
          {current.map((s) => (
            <li key={s.skill_id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <span className="min-w-[8rem] flex-1 text-[0.9375rem] text-ink">
                {s.name}
              </span>

              <label className="flex items-center gap-1.5 text-[0.8125rem] text-muted">
                Level
                <select
                  className="field-input h-7 w-[4.5rem] px-1.5 text-[0.8125rem]"
                  value={s.level}
                  onChange={(e) =>
                    setCurrent((c) =>
                      c.map((x) =>
                        x.skill_id === s.skill_id ? { ...x, level: Number(e.target.value) } : x,
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

              <label className="flex items-center gap-1.5 text-[0.8125rem] text-muted">
                Years
                <input
                  type="number"
                  min={0}
                  max={60}
                  className="field-input h-7 w-[4rem] px-1.5 text-[0.8125rem]"
                  value={s.years}
                  onChange={(e) =>
                    setCurrent((c) =>
                      c.map((x) =>
                        x.skill_id === s.skill_id ? { ...x, years: Number(e.target.value) } : x,
                      ),
                    )
                  }
                />
              </label>

              <button
                type="button"
                onClick={() => remove(s.skill_id)}
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
          <label htmlFor="skill-name" className="field-label">
            Add a skill
          </label>
          <input
            id="skill-name"
            className="field-input"
            list="skill-catalog"
            placeholder="Python, Figma, Postgres"
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <datalist id="skill-catalog">
            {unused.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </div>

        <div>
          <label htmlFor="skill-level" className="field-label">
            Level
          </label>
          <select
            id="skill-level"
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

        <div>
          <label htmlFor="skill-years" className="field-label">
            Years
          </label>
          <input
            id="skill-years"
            type="number"
            min={0}
            max={60}
            className="field-input w-[5rem]"
            value={pendingYears}
            onChange={(e) => setPendingYears(Number(e.target.value))}
          />
        </div>

        <button type="button" onClick={add} className="btn btn-secondary">
          <Plus size={14} weight="bold" />
          Add
        </button>
      </div>

      <div className="mt-5 flex items-center gap-3 border-t border-rule pt-4">
        <button type="button" onClick={persist} className="btn btn-primary" disabled={saving}>
          {saving ? "Saving..." : "Save skills"}
        </button>
        <span className="text-[0.8125rem] text-faint">
          Saving replaces your whole skill set.
        </span>
      </div>
    </div>
  );
}
