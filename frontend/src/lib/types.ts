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
  avatar_url: string | null;
  upi_id: string | null;
  hourly_rate: number | null;
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
  avatar_url: string | null;
  upi_id: string | null;
  hourly_rate: number | null;
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

// ---- schema lab ----

export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
  is_primary_key: boolean;
  is_foreign_key: boolean;
  references: string | null;
}

export interface TableStats {
  name: string;
  rows: number;
  columns: SchemaColumn[];
}

export interface SchemaConstraint {
  table: string;
  name: string;
  kind: string;
  definition: string;
}

export interface SchemaTrigger {
  name: string;
  table: string;
  timing: string;
  event: string;
}

export interface SchemaNode {
  name: string;
  rows: number;
  columns: SchemaColumn[];
}

export interface SchemaEdge {
  name: string;
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
}

export interface SchemaGraph {
  nodes: SchemaNode[];
  edges: SchemaEdge[];
}

export interface SchemaOverview {
  tables: TableStats[];
  constraints: SchemaConstraint[];
  triggers: SchemaTrigger[];
  indexes: number;
  fk_count: number;
  graph: SchemaGraph;
}

// ---- payments / tips ----

export type TransactionKind = "PROJECT" | "TIP";
export type TransactionStatus = "PENDING" | "PAID" | "FAILED" | "CANCELLED";

export interface Transaction {
  id: number;
  project_id: number | null;
  payer_id: number;
  payer_username: string;
  payee_id: number;
  payee_username: string;
  amount: number;
  currency: string;
  kind: TransactionKind;
  status: TransactionStatus;
  upi_txn_id: string | null;
  signature: string | null;
  note: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface Tip {
  id: number;
  project_id: number | null;
  payer_username: string;
  payee_username: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  signature: string | null;
  upi_link: string;
  qr_svg: string;
  note: string | null;
  created_at: string;
}

export interface TipSummary {
  total: number;
  count: number;
  tips: Transaction[];
}

export type OAuthProvider = "github" | "google";
