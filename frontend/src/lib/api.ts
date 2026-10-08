// Typed wrapper over the FastAPI backend.
//
// Everything goes through `request` so error handling is uniform: the backend
// returns {detail: string} on 4xx/5xx, and the UI wants that exact message
// ("You have already applied to this project") not a generic "Request failed".

import type {
  Applicant,
  ApplicationStatus,
  Member,
  Profile,
  ProfileSkill,
  Project,
  ProjectDetail,
  ProjectInput,
  ProjectUpdate,
  PublicProfile,
  SchemaOverview,
  Skill,
  SkillCategory,
  User,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const detail = extractDetail(payload);
    throw new ApiError(res.status, detail ?? `Request failed (${res.status})`);
  }

  return payload as T;
}

/** Pull a readable message out of FastAPI's error shapes. */
function extractDetail(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  // 422 validation errors arrive as an array of {loc, msg}.
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: string; loc?: unknown[] } | undefined;
    if (first?.msg) {
      const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : null;
      return field ? `${String(field)}: ${first.msg}` : first.msg;
    }
  }
  return null;
}

function qs(params: Record<string, string | number | boolean | string[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      for (const v of value) search.append(key, v);
    } else {
      search.set(key, String(value));
    }
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export const api = {
  // ---- auth ----
  register: (body: { username: string; email: string; password: string }) =>
    request<User>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),

  login: (body: { username_or_email: string; password: string }) =>
    request<User>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),

  logout: () => request<void>("/api/auth/logout", { method: "POST" }),

  me: () => request<User>("/api/auth/me"),

  // ---- profile ----
  myProfile: () => request<Profile>("/api/profile"),

  updateProfile: (body: Partial<Omit<Profile, "user_id">>) =>
    request<Profile>("/api/profile", { method: "PUT", body: JSON.stringify(body) }),

  setSkills: (skills: { name: string; level: number; years: number }[]) =>
    request<ProfileSkill[]>("/api/profile/skills", {
      method: "PUT",
      body: JSON.stringify({ skills }),
    }),

  publicProfile: (username: string) =>
    request<PublicProfile>(`/api/profile/${encodeURIComponent(username)}`),

  endorse: (username: string, skillId: number) =>
    request<{ ok: boolean }>(
      `/api/profile/${encodeURIComponent(username)}/endorse/${skillId}`,
      { method: "POST" },
    ),

  unendorse: (username: string, skillId: number) =>
    request<void>(`/api/profile/${encodeURIComponent(username)}/endorse/${skillId}`, {
      method: "DELETE",
    }),

  // ---- skills ----
  skills: () => request<Skill[]>("/api/skills"),
  categories: () => request<SkillCategory[]>("/api/skills/categories"),

  // ---- schema lab ----
  schema: () => request<SchemaOverview>("/api/schema"),

  // ---- search + directory ----
  search: (params: {
    skill?: string[];
    min_level?: number;
    require_all?: boolean;
    q?: string;
    limit?: number;
    offset?: number;
  }) => request<PublicProfile[]>(`/api/search${qs(params)}`),

  people: (params: { skill?: string[]; q?: string; limit?: number; offset?: number }) =>
    request<PublicProfile[]>(`/api/people${qs(params)}`),

  // ---- projects ----
  projects: (params: { skill?: string[]; q?: string; open_only?: boolean; limit?: number }) =>
    request<Project[]>(`/api/projects${qs(params)}`),

  project: (id: number) => request<ProjectDetail>(`/api/projects/${id}`),

  createProject: (body: ProjectInput) =>
    request<ProjectDetail>("/api/projects", { method: "POST", body: JSON.stringify(body) }),

  updateProject: (id: number, body: Partial<ProjectInput>) =>
    request<Project>(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify(body) }),

  deleteProject: (id: number) => request<void>(`/api/projects/${id}`, { method: "DELETE" }),

  apply: (id: number, message: string) =>
    request<Applicant>(`/api/projects/${id}/apply`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),

  withdraw: (id: number) => request<void>(`/api/projects/${id}/apply`, { method: "DELETE" }),

  decide: (projectId: number, applicationId: number, status: ApplicationStatus) =>
    request<Applicant>(`/api/projects/${projectId}/applications/${applicationId}/decide`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),

  // ---- team ----
  leave: (id: number) => request<void>(`/api/projects/${id}/members/me`, { method: "DELETE" }),

  promote: (id: number, username: string) =>
    request<Member>(`/api/projects/${id}/members/${encodeURIComponent(username)}/promote`, {
      method: "POST",
    }),

  close: (id: number) => request<Project>(`/api/projects/${id}/close`, { method: "POST" }),

  invite: (id: number, username: string, message: string) =>
    request<{ ok: boolean; application_id: number }>(`/api/projects/${id}/invite`, {
      method: "POST",
      body: JSON.stringify({ username, message }),
    }),

  postUpdate: (id: number, body: string) =>
    request<ProjectUpdate>(`/api/projects/${id}/updates`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
};
