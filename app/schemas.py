"""Shared Pydantic schemas."""

from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- auth ----------


class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_.-]+$")
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    username_or_email: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class UserOut(ORMModel):
    id: int
    username: str
    created_at: dt.datetime


# ---------- profile ----------


class ProfileIn(BaseModel):
    full_name: str | None = Field(default=None, max_length=120)
    headline: str | None = Field(default=None, max_length=160)
    branch: str | None = Field(default=None, max_length=80)
    year: int | None = Field(default=None, ge=1, le=8)
    location: str | None = Field(default=None, max_length=120)
    bio: str | None = Field(default=None, max_length=4000)
    contact_link: str | None = Field(default=None, max_length=300)
    avatar_url: str | None = Field(default=None, max_length=500)
    upi_id: str | None = Field(default=None, max_length=100)
    hourly_rate: float | None = Field(default=None, ge=0)


class ProfileOut(ORMModel):
    user_id: int
    full_name: str | None = None
    headline: str | None = None
    branch: str | None = None
    year: int | None = None
    location: str | None = None
    bio: str | None = None
    contact_link: str | None = None
    avatar_url: str | None = None
    upi_id: str | None = None
    hourly_rate: float | None = None


class ProfileSkillOut(BaseModel):
    skill_id: int
    name: str
    category: str | None = None
    level: int
    years: int
    endorsements: int = 0


class PublicProfileOut(BaseModel):
    id: int
    username: str
    full_name: str | None = None
    headline: str | None = None
    branch: str | None = None
    year: int | None = None
    location: str | None = None
    bio: str | None = None
    contact_link: str | None = None
    avatar_url: str | None = None
    upi_id: str | None = None
    hourly_rate: float | None = None
    skills: list[ProfileSkillOut] = Field(default_factory=list)


# ---------- skills ----------


class SkillIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    level: int = Field(ge=1, le=5)
    years: int = Field(default=0, ge=0, le=60)


class SkillSetIn(BaseModel):
    skills: list[SkillIn] = Field(default_factory=list, max_length=100)


class CategoryOut(ORMModel):
    id: int
    name: str


class SkillOut(BaseModel):
    id: int
    name: str
    category_id: int | None = None
    category: str | None = None
    people: int = 0


# ---------- projects ----------


class ProjectSkillIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    min_level: int = Field(default=1, ge=1, le=5)


class ProjectIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=8000)
    capacity: int = Field(default=4, ge=1, le=50)
    skills: list[ProjectSkillIn] = Field(default_factory=list, max_length=30)


class ProjectUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=8000)
    capacity: int | None = Field(default=None, ge=1, le=50)
    skills: list[ProjectSkillIn] | None = None


class ProjectSkillOut(BaseModel):
    skill_id: int
    name: str
    min_level: int


class MemberOut(BaseModel):
    user_id: int
    username: str
    role: str
    joined_at: dt.datetime


class ApplicantOut(BaseModel):
    application_id: int
    user_id: int
    username: str
    message: str
    status: str
    # "APPLICANT" when they applied, "OWNER" when the owner invited them. Lets
    # the invitee's own view say "you were invited" rather than "you applied".
    initiated_by: str = "APPLICANT"
    created_at: dt.datetime


class UpdateOut(BaseModel):
    id: int
    author_id: int
    author_username: str
    body: str
    created_at: dt.datetime


class ProjectOut(BaseModel):
    id: int
    owner_id: int
    owner_username: str
    title: str
    description: str
    capacity: int
    status: str
    created_at: dt.datetime
    member_count: int = 0
    required_skills: list[ProjectSkillOut] = Field(default_factory=list)


class ProjectDetailOut(ProjectOut):
    members: list[MemberOut] = Field(default_factory=list)
    updates: list[UpdateOut] = Field(default_factory=list)
    applicants: list[ApplicantOut] | None = None
    my_application: ApplicantOut | None = None
    my_membership: MemberOut | None = None


class ApplyIn(BaseModel):
    message: str = Field(default="", max_length=4000)


class DecisionIn(BaseModel):
    status: str = Field(pattern=r"^(ACCEPTED|REJECTED)$")


class UpdateBodyIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class MemberDecisionIn(BaseModel):
    status: str = Field(pattern=r"^(PENDING|ACCEPTED|REJECTED|WITHDRAWN)$")


# ---------- tasks (project board) ----------


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    assignee_id: int | None = None


class TaskUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    assignee_id: int | None = None
    # Move between columns. When set, position is recomputed server-side.
    status: str | None = Field(default=None, pattern=r"^(TODO|DOING|DONE)$")
    position: int | None = None


class TaskOut(BaseModel):
    id: int
    project_id: int
    title: str
    description: str
    status: str
    assignee_id: int | None = None
    assignee_username: str | None = None
    position: int
    created_by: int
    created_at: dt.datetime
    completed_at: dt.datetime | None = None


class BoardOut(BaseModel):
    """A project's board, grouped so the client does not have to group it."""

    TODO: list[TaskOut] = Field(default_factory=list)
    DOING: list[TaskOut] = Field(default_factory=list)
    DONE: list[TaskOut] = Field(default_factory=list)


# ---------- comments ----------


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    parent_id: int | None = None


class CommentOut(BaseModel):
    id: int
    project_id: int
    author_id: int
    author_username: str
    parent_id: int | None = None
    body: str
    created_at: dt.datetime
    replies: list[CommentOut] = Field(default_factory=list)


# ---------- activity ----------


class ActivityOut(BaseModel):
    id: int
    kind: str
    actor_id: int | None = None
    actor_username: str | None = None
    subject_user_id: int | None = None
    subject_username: str | None = None
    project_id: int | None = None
    project_title: str | None = None
    detail: str | None = None
    created_at: dt.datetime


# ---------- dashboard ----------


class MyProjectOut(BaseModel):
    id: int
    title: str
    status: str
    role: str
    member_count: int
    capacity: int
    open_tasks: int
    total_tasks: int


class MyApplicationOut(BaseModel):
    application_id: int
    project_id: int
    project_title: str
    status: str
    created_at: dt.datetime


# ---------- notifications ----------


class NotificationOut(BaseModel):
    kind: str  # INVITE | TIP
    id: int
    title: str
    detail: str | None = None
    link: str
    created_at: dt.datetime


class NotificationsOut(BaseModel):
    count: int = 0
    items: list[NotificationOut] = Field(default_factory=list)


class StatsOut(BaseModel):
    projects_led: int
    teams_joined: int
    applications_pending: int
    endorsements_received: int
    tasks_assigned_open: int
    profile_completeness: int
    unread_activity: int


class DashboardOut(BaseModel):
    stats: StatsOut
    needs_attention: list[ActivityOut] = Field(default_factory=list)
    recent_activity: list[ActivityOut] = Field(default_factory=list)


# ---------- invitations ----------


class InviteIn(BaseModel):
    username: str = Field(min_length=1, max_length=40)
    message: str = Field(default="", max_length=4000)


# ---------- skill browse ----------


class SkillDetailOut(BaseModel):
    id: int
    name: str
    category: str | None = None
    people: int
    top_people: list[PublicProfileOut] = Field(default_factory=list)


# ---------- schema / lab page ----------


class ColumnOut(BaseModel):
    name: str
    type: str
    nullable: bool
    is_primary_key: bool
    is_foreign_key: bool
    references: str | None = None  # "table.column" the FK points at


class TableStatsOut(BaseModel):
    name: str
    rows: int
    # Columns live here so a caller that only wants to draw the tables does not
    # have to reach into graph.nodes to find them.
    columns: list[ColumnOut] = Field(default_factory=list)


class ConstraintOut(BaseModel):
    table: str
    name: str
    kind: str
    definition: str


class TriggerOut(BaseModel):
    name: str
    table: str
    timing: str
    event: str


class ForeignKeyEdge(BaseModel):
    """One FK relationship, as an edge the graph can draw."""

    name: str
    source_table: str
    source_column: str
    target_table: str
    target_column: str


class TableNodeOut(BaseModel):
    name: str
    rows: int
    columns: list[ColumnOut] = Field(default_factory=list)


class SchemaGraphOut(BaseModel):
    """The relational graph: nodes are tables, edges are foreign keys."""

    nodes: list[TableNodeOut]
    edges: list[ForeignKeyEdge]


class SchemaOut(BaseModel):
    tables: list[TableStatsOut]
    constraints: list[ConstraintOut]
    triggers: list[TriggerOut]
    indexes: int
    fk_count: int
    graph: SchemaGraphOut


# ---------- connections / follows ----------


class ConnectionRequestIn(BaseModel):
    username: str = Field(min_length=1, max_length=40)


class ConnectionOut(BaseModel):
    id: int
    requester_id: int
    recipient_id: int
    other_username: str
    status: str
    created_at: dt.datetime
    responded_at: dt.datetime | None = None


class ConnectionStatusOut(BaseModel):
    status: str  # NONE / PENDING / INCOMING / CONNECTED / REJECTED / BLOCKED


class FollowOut(BaseModel):
    username: str


# ---------- messages ----------


class MessageIn(BaseModel):
    recipient_username: str = Field(min_length=1, max_length=40)
    body: str = Field(min_length=1, max_length=4000)


class MessageOut(BaseModel):
    id: int
    sender_id: int
    sender_username: str
    recipient_id: int
    recipient_username: str
    body: str
    created_at: dt.datetime
    read_at: dt.datetime | None = None


class ThreadOut(BaseModel):
    partner_id: int
    partner_username: str
    last_message: MessageOut


# ---------- payments ----------


class TransactionIn(BaseModel):
    payee_username: str = Field(min_length=1, max_length=40)
    amount: float = Field(gt=0)
    project_id: int | None = None
    note: str | None = Field(default=None, max_length=500)


class TransactionOut(BaseModel):
    id: int
    project_id: int | None = None
    payer_id: int
    payer_username: str
    payee_id: int
    payee_username: str
    amount: float
    currency: str
    kind: str = "PROJECT"
    status: str
    upi_txn_id: str | None = None
    signature: str | None = None
    note: str | None = None
    created_at: dt.datetime
    paid_at: dt.datetime | None = None


class UpiLinkOut(BaseModel):
    upi_link: str


# ---------- tips ----------


class TipIn(BaseModel):
    payee_username: str = Field(min_length=1, max_length=40)
    amount: float = Field(gt=0, le=1_000_000)
    project_id: int | None = None
    note: str | None = Field(default=None, max_length=120)


class TipOut(BaseModel):
    id: int
    project_id: int | None = None
    payer_username: str
    payee_username: str
    amount: float
    currency: str
    status: str
    signature: str | None = None
    upi_link: str
    qr_svg: str
    note: str | None = None
    created_at: dt.datetime


class TipSummaryOut(BaseModel):
    total: float
    count: int
    tips: list[TransactionOut] = Field(default_factory=list)


class OAuthProvidersOut(BaseModel):
    providers: list[str] = Field(default_factory=list)


# ---------- ratings / reports ----------


class RatingIn(BaseModel):
    ratee_username: str = Field(min_length=1, max_length=40)
    project_id: int | None = None
    score: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)


class RatingOut(BaseModel):
    id: int
    rater_id: int
    rater_username: str
    ratee_id: int
    project_id: int | None = None
    score: int
    comment: str | None = None
    created_at: dt.datetime


class RatingSummaryOut(BaseModel):
    average: float | None = None
    count: int = 0
    ratings: list[RatingOut] = Field(default_factory=list)


class ReportIn(BaseModel):
    reported_username: str | None = Field(default=None, max_length=40)
    project_id: int | None = None
    reason: str = Field(pattern=r"^(CHEATING|NO_SHOW|ABUSE|SPAM|OTHER)$")
    details: str | None = Field(default=None, max_length=4000)


class ReportOut(BaseModel):
    id: int
    reporter_id: int
    reported_user_id: int | None = None
    project_id: int | None = None
    reason: str
    details: str | None = None
    status: str
    created_at: dt.datetime


# ---------- skill assessment ----------


class SkillAssessmentIn(BaseModel):
    project_id: int
    ratee_username: str = Field(min_length=1, max_length=40)
    skill_name: str = Field(min_length=1, max_length=60)
    score: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)


# ---------- profile projects / emails ----------


class ProjectEmailOut(BaseModel):
    user_id: int
    username: str
    email: str


class UserProjectsOut(BaseModel):
    ongoing: list[ProjectOut] = Field(default_factory=list)
    finished: list[ProjectOut] = Field(default_factory=list)


class SkillMatchOut(BaseModel):
    matched: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    below_level: list[str] = Field(default_factory=list)
