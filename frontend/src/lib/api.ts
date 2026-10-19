// Typed wrapper over the FastAPI backend.
//
// Everything goes through `request` so error handling is uniform: the backend
// returns {detail: string} on 4xx/5xx, and the UI wants that exact message
// ("You have already applied to this project") not a generic "Request failed".

import type {
  Applicant,
  ApplicationStatus,
  Member,
  OAuthProvider,
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
  Tip,
  TipSummary,
  Transaction,
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
      ...(init.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
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

  /** Which OAuth buttons should the login/register pages show. */
  oauthProviders: () => request<{ providers: OAuthProvider[] }>("/api/auth/oauth/providers"),

  /** Full-page URL that starts the OAuth round-trip. */
  oauthLoginUrl: (provider: OAuthProvider, nextPath = "/") =>
    `/api/auth/oauth/${provider}/login?next=${encodeURIComponent(nextPath)}`,

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

  reopen: (id: number) => request<Project>(`/api/projects/${id}/reopen`, { method: "POST" }),

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

  // ---- profile extras ----
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Profile>("/api/profile/avatar", { method: "POST", body: form, headers: {} });
  },
  userProjects: (username: string) =>
    request<{ ongoing: Project[]; finished: Project[] }>(`/api/profile/${encodeURIComponent(username)}/projects`),
  teamEmails: (projectId: number) =>
    request<{ user_id: number; username: string; email: string }[]>(`/api/projects/${projectId}/team-emails`),
  skillMatch: (projectId: number) =>
    request<{ matched: string[]; missing: string[]; below_level: string[] }>(`/api/projects/${projectId}/skill-match`),

  // ---- connections ----
  requestConnection: (username: string) =>
    request<any>("/api/connections/request", { method: "POST", body: JSON.stringify({ username }) }),
  acceptConnection: (id: number) =>
    request<any>(`/api/connections/${id}/accept`, { method: "POST" }),
  rejectConnection: (id: number) =>
    request<any>(`/api/connections/${id}/reject`, { method: "POST" }),
  removeConnection: (username: string) =>
    request<void>(`/api/connections/${encodeURIComponent(username)}`, { method: "DELETE" }),
  connections: () => request<any[]>("/api/connections"),
  connectionRequests: () => request<any[]>("/api/connections/requests"),
  connectionStatus: (username: string) =>
    request<{ status: string }>(`/api/connections/status/${encodeURIComponent(username)}`),

  // ---- follows ----
  follow: (username: string) => request<void>(`/api/follows/${encodeURIComponent(username)}`, { method: "POST" }),
  unfollow: (username: string) => request<void>(`/api/follows/${encodeURIComponent(username)}`, { method: "DELETE" }),

  // ---- messages ----
  sendMessage: (recipient_username: string, body: string) =>
    request<any>("/api/messages", { method: "POST", body: JSON.stringify({ recipient_username, body }) }),
  messageThreads: () => request<any[]>("/api/messages/threads"),
  messageThread: (username: string) => request<any[]>(`/api/messages/${encodeURIComponent(username)}`),
  markMessageRead: (id: number) => request<any>(`/api/messages/${id}/read`, { method: "PATCH" }),

  // ---- payments ----
  createPayment: (body: { payee_username: string; amount: number; project_id?: number; note?: string }) =>
    request<any>("/api/payments", { method: "POST", body: JSON.stringify(body) }),
  payment: (id: number) => request<any>(`/api/payments/${id}`),
  upiLink: (id: number) => request<{ upi_link: string }>(`/api/payments/${id}/upi-link`),
  confirmPayment: (id: number, upi_txn_id?: string) =>
    request<any>(`/api/payments/${id}/confirm`, { method: "POST", body: JSON.stringify({ upi_txn_id }) }),
  payments: (role = "all") => request<Transaction[]>(`/api/payments?role=${role}`),

  // ---- tips ----
  createTip: (body: { payee_username: string; amount: number; project_id?: number; note?: string }) =>
    request<Tip>("/api/tips", { method: "POST", body: JSON.stringify(body) }),
  confirmTip: (id: number, upi_txn_id?: string) =>
    request<Transaction>(`/api/tips/${id}/confirm`, {
      method: "POST",
      body: JSON.stringify({ upi_txn_id }),
    }),
  receivedTips: () => request<TipSummary>("/api/tips/received"),
  sentTips: () => request<Transaction[]>("/api/tips/sent"),

  // ---- ratings ----
  createRating: (body: { ratee_username: string; project_id?: number; score: number; comment?: string }) =>
    request<any>("/api/ratings", { method: "POST", body: JSON.stringify(body) }),
  ratings: (username: string) => request<any>(`/api/ratings/${encodeURIComponent(username)}`),

  // ---- reports ----
  createReport: (body: { reported_username?: string; project_id?: number; reason: string; details?: string }) =>
    request<any>("/api/reports", { method: "POST", body: JSON.stringify(body) }),

  // ---- skill assessments ----
  assessSkill: (body: { project_id: number; ratee_username: string; skill_name: string; score: number; comment?: string }) =>
    request<any>("/api/skill-assessments", { method: "POST", body: JSON.stringify(body) }),
};
