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


class ProfileOut(ORMModel):
    user_id: int
    full_name: str | None = None
    headline: str | None = None
    branch: str | None = None
    year: int | None = None
    location: str | None = None
    bio: str | None = None
    contact_link: str | None = None


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
