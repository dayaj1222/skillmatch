import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Camera, Gift, Plus, SealCheck, Trash } from "@phosphor-icons/react";

import { TipDialog } from "../components/TipDialog";
import { Empty, ErrorNote, LevelTicks, NumberInput, SectionHead, Select, SkillCombo, Skeleton, SkeletonRows } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Profile, ProfileSkill, Project, PublicProfile, Skill, TipSummary } from "../lib/types";

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

  // Background refreshes never touch `loading`, so the page (and any
  // unsaved form state in it) stays mounted. Only the first load unmounts.
  const load = useCallback(
    async (background = false) => {
      if (!username) return;
      if (!background) setLoading(true);
      try {
        const pub = await api.publicProfile(username);
        setProfile(pub);
        if (isMe) setMine(await api.myProfile());
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load profile");
      } finally {
        if (!background) setLoading(false);
      }
    },
    [username, isMe],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1000px]">
        <SkeletonRows rows={3} />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-[1000px]">
        <ErrorNote message={error ?? "Profile not found"} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1000px] space-y-8">
      <ProfileHeader
        profile={profile}
        isMe={isMe}
        editing={editing}
        onToggleEdit={() => setEditing((e) => !e)}
      />

      {isMe && editing && mine ? (
        <EditProfile profile={mine} onSaved={() => void load(true)} />
      ) : (
        <ReadOnlyProfile profile={profile} isMe={isMe} onChanged={() => void load(true)} onToggleEdit={() => setEditing(true)} />
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
      <div className="flex items-start gap-4 min-w-0">
        <ProfileAvatar profile={profile} />
        <div className="min-w-0">
        <h1 className="display text-[1.75rem]">
          {profile.full_name || profile.username}
        </h1>
        <p className="tnum mt-0.5 text-[0.8125rem] text-faint">
          @{profile.username}
          {meta ? ` · ${meta}` : ""}
        </p>
        {profile.hourly_rate != null && (
          <p className="tnum mt-1 text-[0.875rem] font-medium text-ink">
            ₹{Number(profile.hourly_rate).toLocaleString("en-IN")}/hr
          </p>
        )}
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
      </div>

      {isMe ? (
        <button type="button" onClick={onToggleEdit} className="btn btn-secondary">
          {editing ? "Done editing" : "Edit profile"}
        </button>
      ) : (
        <InviteButton username={profile.username} />
      )}
    </div>
  );
}

function ProfileAvatar({ profile }: { profile: PublicProfile }) {
  const [broken, setBroken] = useState(false);
  const initials = (profile.full_name || profile.username)
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (profile.avatar_url && !broken) {
    return (
      <img
        src={profile.avatar_url}
        alt={profile.username}
        onError={() => setBroken(true)}
        className="h-16 w-16 shrink-0 rounded-full border border-rule object-cover"
      />
    );
  }
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-rule bg-ink text-[1.1rem] font-semibold text-inverse">
      {initials || "?"}
    </div>
  );
}

/** Invite this person to one of my projects. Only renders when signed in. */
function InviteButton({ username }: { username: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<Project[] | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close when focus or a click leaves the panel, or on Escape.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  if (!user) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    setError(null);
    setSent(null);
    if (next && candidates === null) {
      setLoadingProjects(true);
      api
        .projects({ open_only: true, limit: 50 })
        .then((all) =>
          setCandidates(
            all.filter(
              (p) =>
                p.owner_username === user.username &&
                p.status !== "CLOSED" &&
                p.member_count < p.capacity,
            ),
          ),
        )
        .catch(() => setCandidates([]))
        .finally(() => setLoadingProjects(false));
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    setBusy(true);
    setError(null);
    setSent(null);
    try {
      await api.invite(Number(projectId), username, message);
      setSent(candidates?.find((p) => p.id === Number(projectId))?.title ?? "project");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the invite");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button type="button" onClick={toggle} className="btn btn-secondary">
        {open ? "Close" : "Invite"}
      </button>

      {open && (
        <form
          onSubmit={send}
          className="block absolute right-0 z-30 mt-2 w-[min(22rem,80vw)] animate-pop space-y-4 bg-paper p-4 shadow-[0_8px_24px_-8px_rgb(20_22_26/0.14),0_2px_6px_-2px_rgb(20_22_26/0.08)]"
        >
          <div>
            <label htmlFor="profile-invite-project" className="field-label">
              Project
            </label>
            {loadingProjects || candidates === null ? (
              <Skeleton className="h-[2.375rem] w-full rounded-sm" />
            ) : candidates.length === 0 ? (
              <p className="text-[0.875rem] text-muted">
                You are not staffing any project right now.{" "}
                <Link to="/projects/new" className="font-medium text-signal hover:underline">
                  Start one
                </Link>
              </p>
            ) : (
              <Select
                id="profile-invite-project"
                value={projectId}
                onChange={(v) => {
                  setProjectId(v);
                  setSent(null);
                }}
                options={[
                  { value: "", label: "Choose a project" },
                  ...candidates.map((p) => {
                    const spots = p.capacity - p.member_count;
                    return {
                      value: String(p.id),
                      label: `${p.title} (${spots} ${spots === 1 ? "spot" : "spots"} left)`,
                    };
                  }),
                ]}
              />
            )}
          </div>

          {candidates !== null && candidates.length > 0 && (
            <>
              {error && <ErrorNote message={error} />}
              {sent && (
                <p className="rounded-sm border border-active px-3 py-2 text-sm font-medium text-active">
                  Invited @{username} to {sent}.
                </p>
              )}
              <div>
                <label htmlFor="profile-invite-message" className="field-label">
                  Note (optional)
                </label>
                <input
                  id="profile-invite-message"
                  className="field-input"
                  placeholder="You would be great for this."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || !projectId}
              >
                {busy ? "Sending" : "Send invite"}
              </button>
            </>
          )}
        </form>
      )}
    </div>
  );
}

/** Public, read-only view: bio, skills with endorsement counts, endorsing. */
function ReadOnlyProfile({
  profile,
  isMe,
  onChanged,
  onToggleEdit,
}: {
  profile: PublicProfile;
  isMe: boolean;
  onChanged: () => void;
  onToggleEdit?: () => void;
}) {
  const [skillModalOpen, setSkillModalOpen] = useState(false);
  const [projects, setProjects] = useState<{ ongoing: Project[]; finished: Project[] } | null>(null);
  const [tips, setTips] = useState<TipSummary | null>(null);
  const [tipProject, setTipProject] = useState<Project | null>(null);

  useEffect(() => {
    api
      .userProjects(profile.username)
      .then(setProjects)
      .catch(() => setProjects({ ongoing: [], finished: [] }));
  }, [profile.username]);

  useEffect(() => {
    if (!isMe) return;
    api
      .receivedTips()
      .then(setTips)
      .catch(() => setTips(null));
  }, [isMe]);

  const emailTeam = async (projectId: number) => {
    try {
      const emails = await api.teamEmails(projectId);
      const to = emails.map((e) => e.email).join(",");
      const subject = encodeURIComponent("Meeting for project");
      const body = encodeURIComponent("Hi team,\\n\\nLet's schedule a meeting.\\n");
      window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
    } catch {
      /* ignore */
    }
  };

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

      {isMe && tips && (
        <div>
          <SectionHead title="Tips received" />
          <div className="flex flex-wrap items-end gap-x-8 gap-y-2 px-4 py-4">
            <div>
              <p className="tnum display text-[1.75rem]">
                ₹{tips.total.toLocaleString("en-IN", { minimumFractionDigits: 0 })}
              </p>
              <p className="text-[0.8125rem] text-faint">
                from {tips.count} paid {tips.count === 1 ? "tip" : "tips"}
              </p>
            </div>
            {tips.tips.length > 0 && (
              <ul className="min-w-[14rem] flex-1 space-y-1 text-[0.8125rem] text-muted">
                {tips.tips.slice(0, 4).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3">
                    <span>@{t.payer_username}</span>
                    <span className="tnum">₹{Number(t.amount).toLocaleString("en-IN")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div>
        <SectionHead title="Skills" />
        {isMe && onToggleEdit && (
          <button type="button" onClick={onToggleEdit} className="btn btn-secondary mb-4">
            <Plus size={14} weight="bold" />
            Edit skills
          </button>
        )}
        {profile.skills.length === 0 ? (
          <Empty
            title={isMe ? "No skills listed yet" : "No skills listed"}
            body={
              isMe
                ? "Add skills so people searching for collaborators can find you. A profile with no skills never appears in a search."
                : "This person has not added any skills yet."
            }
            action={
              isMe && onToggleEdit ? (
                <button type="button" onClick={onToggleEdit} className="btn btn-secondary">
                  Add skills
                </button>
              ) : null
            }
          />
        ) : (
          <ul className="register border-b border-rule">
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
      <div>
        <SectionHead title="Ongoing projects" />
        {projects === null ? (
          <p className="text-[0.875rem] text-muted">Loading…</p>
        ) : projects.ongoing.length === 0 ? (
          <p className="text-[0.875rem] text-muted">No ongoing projects.</p>
        ) : (
          <ul className="register border-b border-rule">
            {projects.ongoing.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                <Link to={`/projects/${p.id}`} className="text-[0.9375rem] font-medium text-signal hover:underline">
                  {p.title}
                </Link>
                <span className="text-[0.8125rem] text-muted">
                  {p.status} · {p.member_count}/{p.capacity}
                </span>
                {isMe && (
                  <div className="flex items-center gap-2">
                    {p.owner_username === profile.username && (
                      <button
                        type="button"
                        onClick={() => setTipProject(p)}
                        className="btn btn-secondary h-7 px-2 text-[0.8125rem]"
                      >
                        <Gift size={13} weight="bold" />
                        Tip teammate
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void emailTeam(p.id)}
                      className="btn btn-secondary h-7 px-2 text-[0.8125rem]"
                    >
                      Email team
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <SectionHead title="Finished projects" />
        {projects === null ? (
          <p className="text-[0.875rem] text-muted">Loading…</p>
        ) : projects.finished.length === 0 ? (
          <p className="text-[0.875rem] text-muted">No finished projects.</p>
        ) : (
          <ul className="register border-b border-rule">
            {projects.finished.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                <Link to={`/projects/${p.id}`} className="text-[0.9375rem] font-medium text-signal hover:underline">
                  {p.title}
                </Link>
                <span className="text-[0.8125rem] text-muted">
                  Closed · {p.member_count}/{p.capacity}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isMe && skillModalOpen && (
        <SkillPickerModal
          current={profile.skills}
          onClose={() => setSkillModalOpen(false)}
          onSaved={() => {
            setSkillModalOpen(false);
            onChanged();
          }}
        />
      )}

      {tipProject && (
        <TipDialog
          projectId={tipProject.id}
          projectTitle={tipProject.title}
          onClose={() => setTipProject(null)}
        />
      )}
    </div>
  );
}

const SKILL_GROUPS = [
  { name: "Frontend Development", skills: ["HTML5", "CSS3", "JavaScript (ES6+)", "TypeScript", "React", "Next.js", "Vue.js", "Nuxt.js", "Angular", "Svelte", "Tailwind CSS", "Sass/SCSS", "Styled Components", "Bootstrap"] },
  { name: "Backend Development", skills: ["Node.js/Express", "Python (FastAPI/Django)", "Java (Spring Boot)", "Go", "Rust", "C# (.NET)", "REST APIs", "GraphQL", "gRPC", "WebSockets"] },
  { name: "Mobile Development", skills: ["Flutter", "React Native", "Expo", "Swift (iOS)", "Kotlin (Android)"] },
  { name: "Data Science, AI & ML", skills: ["PyTorch", "TensorFlow", "OpenCV", "Scikit-Learn", "Pandas/NumPy", "Computer Vision", "NLP / LLMs", "Data Engineering", "MLOps"] },
  { name: "Cloud & DevOps", skills: ["AWS", "Google Cloud (GCP)", "Microsoft Azure", "Docker", "Kubernetes", "Terraform", "CI/CD (GitHub Actions, GitLab CI)"] },
  { name: "Databases & Storage", skills: ["PostgreSQL", "MySQL", "MongoDB", "Redis", "PostgreSQL (pgvector)", "Firebase"] },
  { name: "Embedded Systems & Hardware", skills: ["ESP32", "STM32", "Arduino", "Raspberry Pi", "8051", "Embedded C/C++", "FreeRTOS", "MQTT", "UART/I2C/SPI", "TinyML"] },
];

function SkillPickerModal({
  current,
  onClose,
  onSaved,
}: {
  current: ProfileSkill[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [genre, setGenre] = useState<string | null>(null);
  const [selected, setSelected] = useState(() => new Set(current.map((s) => s.name)));
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = (name: string) => setSelected((old) => {
    const next = new Set(old);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });
  const visibleGroups = SKILL_GROUPS.map((group) => ({
    ...group,
    skills: group.skills.filter((s) => s.toLowerCase().includes(query.toLowerCase())),
  })).filter((group) => !genre || group.name === genre).filter((group) => group.skills.length);
  const save = async () => {
    setSaving(true);
    try {
      await api.setSkills([...selected].map((name) => {
        const old = current.find((s) => s.name === name);
        return { name, level: old?.level ?? 3, years: old?.years ?? 0 };
      }));
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save skills");
    } finally { setSaving(false); }
  };
  return (
    <div className="skill-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="skill-picker-title" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="skill-modal animate-pop">
        <div className="flex items-start justify-between gap-4 border-b border-rule pb-4">
          <div><p className="eyebrow">Skill library</p><h2 id="skill-picker-title" className="display text-[1.6rem]">Build your toolkit</h2></div>
          <button type="button" className="btn btn-ghost h-8 px-2" onClick={onClose} aria-label="Close">×</button>
        </div>
        <input className="field-input mt-4" placeholder="Search skills" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        {!genre && !query ? (
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {SKILL_GROUPS.map((group) => <button key={group.name} type="button" className="genre-card" onClick={() => setGenre(group.name)}><span>{group.name}</span><small>{group.skills.length} skills</small></button>)}
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={`chip ${!genre ? "chip-active" : ""}`} onClick={() => setGenre(null)}>All genres</button>
              {SKILL_GROUPS.map((group) => <button key={group.name} type="button" className={`chip ${genre === group.name ? "chip-active" : ""}`} onClick={() => setGenre(group.name)}>{group.name}</button>)}
            </div>
            <div className="skill-options mt-4">{visibleGroups.flatMap((group) => group.skills.map((name) => <button key={name} type="button" className={`skill-option ${selected.has(name) ? "skill-option-selected" : ""}`} onClick={() => toggle(name)}><span>{selected.has(name) ? "✓" : "+"}</span>{name}</button>))}</div>
          </>
        )}
        {error && <ErrorNote message={error} />}
        <div className="mt-5 flex items-center justify-between border-t border-rule pt-4"><span className="text-[0.8125rem] text-muted">{selected.size} selected</span><div className="flex gap-2"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save skills"}</button></div></div>
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
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
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
      if (avatarFile) {
        await api.uploadAvatar(avatarFile);
      }
      await api.updateProfile({
        full_name: form.full_name,
        headline: form.headline,
        branch: form.branch,
        year: form.year,
        location: form.location,
        bio: form.bio,
        contact_link: form.contact_link,
        upi_id: form.upi_id,
        hourly_rate: form.hourly_rate,
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
      <form onSubmit={submit} className="block space-y-4 p-5">
        <SectionHead title="Your details" />
        {error && <ErrorNote message={error} />}

        <div>
          <span className="field-label">Profile picture</span>
          <div className="mt-1 flex flex-wrap items-center gap-4">
            <AvatarPreview current={form.avatar_url} file={avatarFile} />
            <div>
              <label htmlFor="avatar" className="btn btn-secondary cursor-pointer">
                <Camera size={15} weight="bold" />
                {avatarFile ? "Choose another" : "Upload photo"}
              </label>
              <input
                id="avatar"
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="sr-only"
                onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
              />
              <p className="field-help mt-1">
                JPG, PNG, GIF or WebP · up to 5 MB.
                {avatarFile ? ` Selected: ${avatarFile.name}` : ""}
              </p>
            </div>
          </div>
        </div>

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
            <p className="field-help">Email is never shown.</p>
          </div>
          <div>
            <label htmlFor="upi_id" className="field-label">
              UPI ID
            </label>
            <input
              id="upi_id"
              className="field-input"
              placeholder="you@upi"
              value={form.upi_id ?? ""}
              onChange={(e) => set("upi_id", e.target.value || null)}
            />
          </div>
          <div>
            <label htmlFor="hourly_rate" className="field-label">
              Hourly rate
            </label>
            <input
              id="hourly_rate"
              type="number"
              min={0}
              step="0.01"
              className="field-input"
              value={form.hourly_rate ?? ""}
              onChange={(e) =>
                set("hourly_rate", e.target.value ? Number(e.target.value) : null)
              }
            />
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

function AvatarPreview({ current, file }: { current: string | null; file: File | null }) {
  const [url, setUrl] = useState<string | null>(current);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (!file) {
      setUrl(current);
      setBroken(false);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    setBroken(false);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, current]);

  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-rule bg-rule/20">
      {url && !broken ? (
        <img
          src={url}
          alt="Profile preview"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <Camera size={26} className="text-faint" />
      )}
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

  const refreshOwnSkills = useCallback(async () => {
    if (!user) return;
    try {
      setCurrent((await api.publicProfile(user.username)).skills);
    } catch {
      /* keep the local list; the error surfaces on the next save */
    }
  }, [user]);

  const persist = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.setSkills(current.map((s) => ({ name: s.name, level: s.level, years: s.years })));
      // Reload only this component's list. The parent refresh is background,
      // so the details form above keeps any unsaved edits.
      await refreshOwnSkills();
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
    <div className="block p-5">
      <SectionHead title="Skills" />
      {error && <ErrorNote message={error} />}

      {current.length === 0 ? (
        <p className="mb-4 text-[0.875rem] text-muted">
          You have not added any skills yet. Search ranks people by these, so a profile without
          skills is invisible to search.
        </p>
      ) : (
        <ul className="register mb-4 border-b border-rule">
          {current.map((s) => (
            <li key={s.skill_id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <span className="min-w-[8rem] flex-1 text-[0.9375rem] text-ink">
                {s.name}
              </span>

              <span className="flex items-center gap-1.5 text-[0.8125rem] text-muted">
                Level
                <span className="w-[4.5rem]">
                  <Select
                    aria-label={`Level for ${s.name}`}
                    className="h-7 px-1.5 text-[0.8125rem]"
                    value={String(s.level)}
                    onChange={(v) =>
                      setCurrent((c) =>
                        c.map((x) =>
                          x.skill_id === s.skill_id ? { ...x, level: Number(v) } : x,
                        ),
                      )
                    }
                    options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
                  />
                </span>
              </span>

              <label className="flex items-center gap-1.5 text-[0.8125rem] text-muted">
                Years
                <NumberInput
                  aria-label={`Years for ${s.name}`}
                  min={0}
                  max={60}
                  className="h-7 w-[4rem] px-1.5 text-[0.8125rem]"
                  value={s.years}
                  onChange={(v) =>
                    setCurrent((c) =>
                      c.map((x) => (x.skill_id === s.skill_id ? { ...x, years: v } : x)),
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
          <SkillCombo
            id="skill-name"
            placeholder="Python, Figma, Postgres"
            value={pendingName}
            onChange={setPendingName}
            onCommit={add}
            options={unused.map((s) => ({ name: s.name, people: s.people }))}
          />
        </div>

        <div>
          <label htmlFor="skill-level" className="field-label">
            Level
          </label>
          <Select
            id="skill-level"
            className="w-[9rem]"
            value={String(pendingLevel)}
            onChange={(v) => setPendingLevel(Number(v))}
            options={[1, 2, 3, 4, 5].map((n) => ({
              value: String(n),
              label: `${["Beginner", "Basic", "Competent", "Strong", "Expert"][n - 1]} (${n})`,
            }))}
          />
        </div>

        <div>
          <label htmlFor="skill-years" className="field-label">
            Years
          </label>
          <NumberInput
            id="skill-years"
            min={0}
            max={60}
            className="w-[5rem]"
            value={pendingYears}
            onChange={setPendingYears}
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
