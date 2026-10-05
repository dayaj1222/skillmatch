// Types mirror the backend Pydantic schemas in app/schemas.py.
// Keeping them hand-written (rather than generated) is deliberate at this size:
// the API surface is 26 endpoints and the shapes are stable.

export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface Profile {
  user_id: number;
  full_name: string | null;
  headline: string | null;
  branch: string | null;
  year: number | null;
  location: string | null;
  bio: string | null;
  contact_link: string | null;
}

export interface ProfileSkill {
  skill_id: number;
  name: string;
  category: string | null;
  level: number;
  years: number;
  endorsements: number;
}

export interface PublicProfile {
  id: number;
  username: string;
  full_name: string | null;
  headline: string | null;
  branch: string | null;
  year: number | null;
  location: string | null;
  bio: string | null;
  contact_link: string | null;
  skills: ProfileSkill[];
}

export interface Skill {
  id: number;
  name: string;
  category_id: number | null;
  category: string | null;
  people: number;
}

export interface SkillCategory {
  id: number;
  name: string;
}

export type ProjectStatus = "OPEN" | "FORMING" | "ACTIVE" | "CLOSED";
export type ApplicationStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
export type MemberRole = "LEADER" | "MEMBER";

export interface ProjectSkill {
  skill_id: number;
  name: string;
  min_level: number;
}

export interface Member {
  user_id: number;
  username: string;
  role: MemberRole;
  joined_at: string;
}

export interface Applicant {
  application_id: number;
  user_id: number;
  username: string;
  message: string;
  status: ApplicationStatus;
  // "APPLICANT" when they applied, "OWNER" when the owner invited them.
  initiated_by: "APPLICANT" | "OWNER";
  created_at: string;
}

export interface ProjectUpdate {
  id: number;
  author_id: number;
  author_username: string;
  body: string;
  created_at: string;
}

export interface Project {
  id: number;
  owner_id: number;
  owner_username: string;
  title: string;
  description: string;
  capacity: number;
  status: ProjectStatus;
  created_at: string;
  member_count: number;
  required_skills: ProjectSkill[];
}

export interface ProjectDetail extends Project {
  members: Member[];
  updates: ProjectUpdate[];
  applicants: Applicant[] | null;
  my_application: Applicant | null;
  my_membership: Member | null;
}

export interface ProjectInput {
  title: string;
  description: string;
  capacity: number;
  skills: { name: string; min_level: number }[];
}
