# CONTEXT.md — SkillMatch current state

Last updated: 2026-10-17 (plan phase)

## Current state

- Backend: FastAPI + SQLAlchemy + Postgres. Tests passing. Migrations idempotent.
- New backend features implemented: profile avatar/upi/hourly_rate, follows,
  connections, messages (gated by connection), UPI payments, ratings, reports,
  skill assessments, ongoing/finished projects, team emails, skill match.
- Frontend: avatar upload, UPI/hourly fields, ongoing/finished projects with
  email-team, skill-mismatch notifier on apply, skill level editing unified.
- Lifecycle: OPEN/FORMING/ACTIVE/CLOSED. ACTIVE when roster at capacity; apply/invite
  rejected when full.
- Known gaps: advanced UI for payments/connections/messages/ratings/reports
  (APIs ready); no Alembic, no rate limiting, no email verification.

## Requested features (roadmap)

See ~/.opencode/plan/skillmatch-feature-plan.md for full step-by-step.

1. Auto-close recruiting when team packed (apply/invite rejected at ACTIVE).
2. Skill assessment by project owner after close (survey modal → endorsements).
3. Skill-mismatch notifier on apply.
2. Profile: ongoing vs finished projects; "email team" on ongoing.
3. Skills: add level when adding; unify editors; allow modify/remove (partly exists).
4. Profile picture (avatar_url + optional upload).
5. Transactions/payments via UPI with per-user fee (hourly_rate + upi_id).
6. Follow + connect (LinkedIn-style); messaging only between connections.
7. Ratings + reports for both project creators and workers.

## Next tasks (start here)

Phase 1 — DB schema/migrations:
- Add Profile.avatar_url, upi_id, hourly_rate.
- Create follows, connections, messages, transactions, ratings, reports tables.
- Add migration steps + triggers.
Phase 2 — schemas.
Phase 3 — services.
Phase 4 — routers.
Phase 5 — frontend.
Phase 6 — tests.
Phase 7 — docs.

## Environment

- Python: uv. Postgres dev 127.0.0.1:5433 skillmatch.
- Tests: skillmatch_pytest (auto recreated).
- Frontend build: cd frontend && npm run build.
- Env vars: SKILLMATCH_DATABASE_URL, SKILLMATCH_SECRET,
  SKILLMATCH_COOKIE_SECURE, SKILLMATCH_SQL_ECHO.

## Collaboration notes

- Update this file after each meaningful change.
- Keep invariants in DB; service checks are UX only.
- Run pytest + ruff + frontend build before PR.