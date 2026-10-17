# AGENTS.md — SkillMatch collaboration guide

Read this and CONTEXT.md before making changes.

## Project

SkillMatch: team-finder for small projects. People register with background +
skills; anyone posts a project; matching people apply; owner accepts; accepted
set becomes team. The point: the **database enforces the rules** (capacity,
one leader, endorsement integrity, application state machine) via constraints,
indexes, triggers — verified by tests racing real threads against real Postgres.

Stack: Postgres 16+ (citext, pg_trgm) · FastAPI · SQLAlchemy 2.0 · psycopg 3 ·
pytest (43 tests) · React/Vite/Tailwind.

## Golden rules

1. Status derived, never set by hand: OPEN->FORMING->ACTIVE by roster fullness;
   only CLOSED explicit. Use projects_service.recompute_status.
2. Capacity + accept-creates-membership live in DB triggers; service checks are UX only.
3. One leader per project via partial unique index; demote current leader first on transfer.
4. Activity feed written by triggers; no app-level activity inserts.
5. Auth never reads profile columns (profiles split from users).
6. Level belongs to relationship (user_skills), not skill/user.
7. Migrations are idempotent steps in app/migrations.py; add new steps, don't edit shipped ones.

## Map

app/: models, schemas, migrations, triggers, auth, *_service, routers, main.
frontend/src/: pages, components, lib (api, auth, types, relation).
tests/: pytest, throwaway DB per test.

## Commands

uv sync; uv run pytest; uv run ruff check .
uv run uvicorn app.main:app --host 127.0.0.1 --port 8766
cd frontend && npm install && npm run dev / npm run build

DB dev: Postgres 127.0.0.1:5433 skillmatch; tests use skillmatch_pytest.

## Conventions

Backend: Python 3.11+, typed, SQLAlchemy 2.0, ruff clean. Routers thin; rules in
*_service.py. Reuse relationship_for, require_member, recompute_status.
Frontend: TS strict; types mirror app/schemas.py; Tailwind theme tokens only.

## Collaboration protocol

1. Read AGENTS.md + CONTEXT.md + relevant service before editing; check git status/log.
2. Plan non-trivial work in ~/.opencode/plan/ or docs/plans/; get approval.
3. Small commits: feat(scope)/fix(scope)/docs.
4. Add tests for new invariants; run full suite before push.
5. Update CONTEXT.md after meaningful changes.
6. Don't hand-edit static/assets/*; rebuild frontend. Don't commit node_modules/.venv/DB data.
7. Never commit real secrets.

## Branching

main protected; feature branches feat/<topic>. PR needs green CI + CONTEXT.md update.
Note migration steps in PR for schema changes.

## Plan location

Full roadmap: ~/.opencode/plan/skillmatch-feature-plan.md (summarized in CONTEXT.md).