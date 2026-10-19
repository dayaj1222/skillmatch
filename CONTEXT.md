# CONTEXT.md — SkillMatch current state

Last updated: 2026-10-19

## What this is

SkillMatch is a team-finder for small projects. People register with a
background and skills; anyone posts a project; matching people apply; the owner
accepts; the accepted set becomes the team. The database enforces the core
rules (capacity, one leader, endorsement integrity, application state machine)
through constraints, indexes, and triggers.

## Stack and commands

- Backend: Postgres 16+ (citext, pg_trgm) · FastAPI · SQLAlchemy 2.0 · psycopg 3
- Frontend: React/Vite/Tailwind, built into `static/` and served by FastAPI
- Tests: `uv run pytest` (82 passed) · `uv run ruff check .` (clean)
- Frontend build: `cd frontend && npm run build`
- Dev server: `uv run uvicorn app.main:app --host 127.0.0.1 --port 8766`
- DB: `127.0.0.1:5433/skillmatch`; tests use `skillmatch_pytest` (recreated per test)

## Implemented features

### Core lifecycle and skills
- Auth: register/login/logout/me, signed httpOnly session cookie.
- Profiles split from users so auth never reads profile columns.
- Skills: canonical vocabulary, `user_skills.level` 1–5 + years, endorsements.
- Projects: OPEN → FORMING → ACTIVE (derived), CLOSED explicit; capacity and
  accept-creates-membership are DB triggers; one leader via partial unique index.
- Applications/invites: state machine; apply/invite rejected when full/closed.
- Tasks, comments, project updates, activity feed written by triggers.
- Skill match preflight (`/api/projects/{id}/skill-match`) and a frontend
  "Skills not matched" confirmation modal; the user can still apply.
- Owner skill assessments after a project closes; assessments also create an
  endorsement (`/api/skill-assessments`).

### Profile and social
- `profiles.avatar_url`, `upi_id`, `hourly_rate`; hourly rate is shown on the
  public profile header (`₹N/hr`).
- Avatar upload (`POST /api/profile/avatar`) with 5 MB limit and image-extension
  checks. Files live in `SKILLMATCH_UPLOAD_DIR` (default `var/avatars`), outside
  the SPA build output, and are served at `/avatars/...`. Vite proxies
  `/avatars` in development.
- Ongoing vs finished projects (`/api/profile/{username}/projects`).
- Team emails for the owner/team (`/api/projects/{id}/team-emails`).
- Follows (one-way) and connections (request/accept/reject/remove/status).
- Messages only between accepted connections, enforced by a DB trigger.

### Payments, tips, ratings, reports
- UPI payment records with deep links (`/api/payments/...`).
- Tips from a project owner to a teammate (`POST /api/tips`): creates a signed
  transaction, returns a UPI URI plus an inline SVG QR code. The payer confirms;
  only PAID tips count.
- Tip privacy: `GET /api/tips/received` always answers for the caller, so a
  person sees their own tip total and nobody else's. The public profile shows
  the "Tips received" card only when `isMe`.
- Ratings (1–5) and reports for users/projects.

### OAuth (GitHub + Google)
- Provider listing (`GET /api/auth/oauth/providers`), start
  (`/api/auth/oauth/{provider}/login`), callback
  (`/api/auth/oauth/{provider}/callback`).
- Signed OAuth state (10-minute expiry), open-redirect guard, account linking by
  verified provider email, automatic username collision suffixing.
- OAuth users get a random unusable password hash; `oauth_accounts` links
  `(provider, subject)` to `users.id`.
- Buttons appear only when both client id/secret for that provider are set.

## Schema additions (this round)

- `oauth_accounts` (new table, unique `(provider, subject)`).
- `transactions.kind` (`PROJECT`/`TIP`) and `transactions.signature`.
- Migration steps: `0006_payment_tips`, `0007_triggers`; `create_all` creates
  `oauth_accounts` on existing databases.

## Configuration

Copy `.env.example` to `.env`.

- `SKILLMATCH_DATABASE_URL`, `SKILLMATCH_SECRET`
- `SKILLMATCH_COOKIE_SECURE`, `SKILLMATCH_SQL_ECHO`
- `SKILLMATCH_UPLOAD_DIR` (default `var/avatars`)
- `SKILLMATCH_PUBLIC_BASE_URL` (default `http://127.0.0.1:8766`)
- `SKILLMATCH_FRONTEND_BASE_URL` (default `http://127.0.0.1:5173`)
- `SKILLMATCH_GITHUB_CLIENT_ID` / `SKILLMATCH_GITHUB_CLIENT_SECRET`
- `SKILLMATCH_GOOGLE_CLIENT_ID` / `SKILLMATCH_GOOGLE_CLIENT_SECRET`

OAuth callback URLs:
`{PUBLIC_BASE_URL}/api/auth/oauth/github/callback` and
`{PUBLIC_BASE_URL}/api/auth/oauth/google/callback`.

## Tests

- `tests/test_tips.py` — UPI requirement, QR/signature shape, paid-only private
  totals, payer-only confirmation, self-tip rejection.
- `tests/test_oauth.py` — provider discovery, unconfigured 503, state tamper
  detection, account linking, collision handling, callback session issuance.
- `tests/test_avatars.py` — upload/serve round-trip, non-image rejection.
- Existing suites cover lifecycle, concurrency, search, skills, tasks,
  comments, activity, and the schema lab.

## Known gaps

- UPI is a record + QR flow, not a PSP integration. Money moves directly between
  UPI apps; the payer confirms. HMAC signatures detect tampered references but
  do not settle funds.
- Advanced UI for connections/messages/ratings/reports is still API-only.
- No Alembic; `migrations.py` is an ordered, idempotent bootstrap.
- No rate limiting, email verification, or password reset.

## Collaboration notes

- Update this file after each meaningful change.
- Keep invariants in the DB; service checks are UX only.
- Run pytest + ruff + frontend build before pushing.
