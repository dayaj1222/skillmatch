"""ORM models and the database-level invariants they enforce.

Design notes worth defending in a review:

* ``citext`` makes skill names case-insensitively unique, so "Python" typed
twice is one skill rather than two.
* ``user_skills`` and ``project_skills`` are attribute-carrying join tables:
the ``level`` / ``min_level`` belongs to the *relationship*, not either side.
* ``endorsements`` carries a composite FK to ``user_skills``, so the database
refuses to endorse a skill the person does not actually list.
* ``applications`` has a unique ``(project_id, applicant_id)`` so a person has
at most one application per project; combined with the status CHECK this is
the state machine.
* A partial unique index gives every project exactly one LEADER.
* Triggers enforce the two rules constraints cannot express: team size never
exceeds project capacity, and accepting an application atomically creates a
membership.
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    email: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    profile: Mapped[Profile | None] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    skills: Mapped[list[UserSkill]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    projects: Mapped[list[Project]] = relationship(back_populates="owner")


class Profile(Base):
    """Split from ``users`` so auth queries never read profile columns."""

    __tablename__ = "profiles"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    full_name: Mapped[str | None] = mapped_column(String(120))
    headline: Mapped[str | None] = mapped_column(String(160))
    branch: Mapped[str | None] = mapped_column(String(80))
    year: Mapped[int | None] = mapped_column(Integer)
    location: Mapped[str | None] = mapped_column(String(120))
    bio: Mapped[str | None] = mapped_column(Text)
    contact_link: Mapped[str | None] = mapped_column(String(300))

    __table_args__ = (
        CheckConstraint("year IS NULL OR (year >= 1 AND year <= 8)", name="ck_profile_year"),
    )

    user: Mapped[User] = relationship(back_populates="profile")


class SkillCategory(Base):
    __tablename__ = "skill_categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    skills: Mapped[list[Skill]] = relationship(back_populates="category")


class Skill(Base):
    """Canonical vocabulary. CITEXT unique name prevents duplicate skills."""

    __tablename__ = "skills"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("skill_categories.id", ondelete="SET NULL")
    )

    category: Mapped[SkillCategory | None] = relationship(back_populates="skills")


class UserSkill(Base):
    """A person's claim to a skill. The attribute lives on the relationship."""

    __tablename__ = "user_skills"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    skill_id: Mapped[int] = mapped_column(
        ForeignKey("skills.id", ondelete="CASCADE"), primary_key=True
    )
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    years: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    __table_args__ = (
        CheckConstraint("level >= 1 AND level <= 5", name="ck_userskill_level"),
        CheckConstraint("years >= 0 AND years <= 60", name="ck_userskill_years"),
        Index("ix_userskill_skill_level", "skill_id", "level"),
    )

    user: Mapped[User] = relationship(back_populates="skills")
    skill: Mapped[Skill] = relationship()


class Endorsement(Base):
    """One person vouching for a skill on someone else's profile.

    The composite FK to ``user_skills`` is the important part: you can only
    endorse a (person, skill) pair that actually exists on their profile.
    """

    __tablename__ = "endorsements"

    endorser_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    skill_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "skill_id"],
            ["user_skills.user_id", "user_skills.skill_id"],
            ondelete="CASCADE",
            name="fk_endorsement_userskill",
        ),
        CheckConstraint("endorser_id <> user_id", name="ck_endorsement_not_self"),
    )


class Project(Base):
    """One object, one lifecycle. OPEN is the "idea post" stage."""

    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("4"))
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default=text("'OPEN'")
    )
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    closed_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("capacity >= 1 AND capacity <= 50", name="ck_project_capacity"),
        CheckConstraint(
            "status IN ('OPEN','FORMING','ACTIVE','CLOSED')", name="ck_project_status"
        ),
    )

    owner: Mapped[User] = relationship(back_populates="projects")
    required_skills: Mapped[list[ProjectSkill]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    applications: Mapped[list[Application]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    memberships: Mapped[list[Membership]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    updates: Mapped[list[ProjectUpdate]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    tasks: Mapped[list[Task]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    comments: Mapped[list[ProjectComment]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class ProjectSkill(Base):
    __tablename__ = "project_skills"

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    skill_id: Mapped[int] = mapped_column(
        ForeignKey("skills.id", ondelete="CASCADE"), primary_key=True
    )
    min_level: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))

    __table_args__ = (
        CheckConstraint("min_level >= 1 AND min_level <= 5", name="ck_projectskill_min_level"),
    )

    project: Mapped[Project] = relationship(back_populates="required_skills")
    skill: Mapped[Skill] = relationship()


class Application(Base):
    """The state machine: PENDING -> ACCEPTED | REJECTED | WITHDRAWN.

    Rejection is terminal in this design: the unique (project_id, applicant_id)
    prevents a second application, so the owner's decision is final.
    """

    __tablename__ = "applications"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    applicant_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    message: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default=text("'PENDING'")
    )
    # Who opened this row: the applicant themselves, or the owner inviting them.
    # It exists so the activity feed can say "invited" rather than "applied";
    # the two look identical in every other respect.
    initiated_by: Mapped[str] = mapped_column(
        String(9), nullable=False, server_default=text("'APPLICANT'")
    )
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    decided_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    __table_args__ = (
        UniqueConstraint("project_id", "applicant_id", name="uq_application_once"),
        CheckConstraint(
            "initiated_by IN ('APPLICANT','OWNER')", name="ck_application_initiated_by"
        ),
        CheckConstraint(
            "status IN ('PENDING','ACCEPTED','REJECTED','WITHDRAWN')", name="ck_application_status"
        ),
        Index("ix_application_project_status", "project_id", "status"),
    )

    project: Mapped[Project] = relationship(back_populates="applications")
    applicant: Mapped[User] = relationship(foreign_keys=[applicant_id])


class Membership(Base):
    """The team. A row exists only for an accepted applicant (or the owner)."""

    __tablename__ = "memberships"

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(6), nullable=False, server_default=text("'MEMBER'"))
    joined_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint("role IN ('LEADER','MEMBER')", name="ck_membership_role"),
        Index(
            "uq_membership_one_leader",
            "project_id",
            unique=True,
            postgresql_where=text("role = 'LEADER'"),
        ),
    )

    project: Mapped[Project] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship()


class ProjectUpdate(Base):
    __tablename__ = "project_updates"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    project: Mapped[Project] = relationship(back_populates="updates")
    author: Mapped[User] = relationship()


class Task(Base):
    """A card on a project's board.

    ``status`` is a three-value state machine. ``position`` orders cards within a
    column so drag-and-drop survives a reload; it is an integer rather than a
    float so reordering is a simple rewrite, which is fine at this scale.

    ``assignee_id`` is restricted by trigger to a current team member: a task
    assigned to someone who left the team is an inconsistent state.
    """

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    status: Mapped[str] = mapped_column(
        String(5), nullable=False, server_default=text("'TODO'")
    )
    assignee_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    created_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint(
            "status IN ('TODO','DOING','DONE')", name="ck_task_status"
        ),
        Index("ix_task_project_status_pos", "project_id", "status", "position"),
    )

    project: Mapped[Project] = relationship(back_populates="tasks")
    assignee: Mapped[User | None] = relationship(foreign_keys=[assignee_id])


class ProjectComment(Base):
    """A comment on a project. One level of replies via ``parent_id``.

    The self-FK plus a trigger that refuses a reply-to-a-reply keeps threads flat
    without the application having to enforce it.
    """

    __tablename__ = "project_comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("project_comments.id", ondelete="CASCADE")
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    project: Mapped[Project] = relationship(back_populates="comments")
    author: Mapped[User] = relationship()


class Activity(Base):
    """The activity feed.

    Rows are written by database triggers on the events that matter, not by
    application code. That keeps the feed honest: if an application was accepted,
    the trigger fired, so the event is in the feed. An app-level write could be
    forgotten.

    ``kind`` is a small closed vocabulary; the UI maps it to a sentence.
    """

    __tablename__ = "activity"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(24), nullable=False)
    actor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    # The person the event is *about* (recipient of an endorsement, invitee, etc).
    subject_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE")
    )
    # Free-form detail, e.g. the skill endorsed. Small and optional by design.
    detail: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    __table_args__ = (
        CheckConstraint(
            "kind IN ('PROJECT_CREATED','APPLIED','ACCEPTED','REJECTED','WITHDRAWN',"
            "'INVITED','JOINED','LEFT','ENDORSED','TASK_DONE','COMMENTED','CLOSED')",
            name="ck_activity_kind",
        ),
    )


__all__ = [
    "Activity",
    "Application",
    "Base",
    "Endorsement",
    "Membership",
    "Profile",
    "Project",
    "ProjectComment",
    "ProjectSkill",
    "ProjectUpdate",
    "Skill",
    "SkillCategory",
    "Task",
    "User",
    "UserSkill",
]
