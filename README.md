# SkillMatch

A team-finder for small projects. People register with a background and a set of
skills; anyone can post a project, and the people whose skills match apply. The
project owner accepts some, and the accepted set becomes the team.

Built for a Database Systems lab: the point is not the CRUD, it is that the
**database itself enforces the rules**. Capacity ceilings, one-leader-per-team,
endorsement integrity, and the application state machine are all constraints,
indexes, and triggers — verified by tests that race real threads against real
Postgres.

## Stack

- **Postgres 16+** — `citext` for case-insensitive skill dedupe, `pg_trgm` for text search
- **FastAPI** + **SQLAlchemy 2.0** (typed ORM) + **psycopg 3**
- **pytest** — 43 tests, throwaway database per test

## Run

```bash
uv sync

# A user-owned Postgres cluster (no sudo needed):
bash -c '
  PGROOT=$HOME/.local/share/pgdata
  [ -f $PGROOT/PG_VERSION ] || initdb -D $PGROOT -U $(whoami) --auth=trust
  pg_ctl -D $PGROOT -o "-p 5433 -k /tmp" -l $PGROOT/server.log start
  psql -h 127.0.0.1 -p 5433 -U $(whoami) -d postgres -c "CREATE DATABASE skillmatch"
'

uv run uvicorn app.main:app --host 127.0.0.1 --port 8766
```

Open http://127.0.0.1:8766/ — interactive API docs at `/docs`.

## Test

```bash
uv run pytest        # 43 passed
uv run ruff check .  # clean
```

Tests run against a `skillmatch_pytest` database that is dropped and recreated
per test, so your dev data is never touched.

## The schema

Eleven tables. Every rule that can be a constraint *is* a constraint.

```
users ──1:1── profiles
  │
  ├──< user_skills >── skills ──> skill_categories
  │         ▲
  │         └──< endorsements
  │
  ├──< projects >── project_skills
  │       │
  │       ├──< applications
  │       ├──< memberships
  │       └──< project_updates
```

**Why the shape is this way:**

- `user_skills` and `project_skills` are *attribute-carrying join tables*. Level
  belongs to the person-skill relationship, not to either side. This is the
  textbook case that separates 3NF from 2NF.
- `profiles` is split from `users` so auth never reads profile columns.
- `skills` is separate from `user_skills` so "Python" typed twice is one row.

## The invariants, and where they live

| Rule | Enforced by |
|---|---|
| One skill name, case-insensitive | `citext` UNIQUE on `skills.name` |
| Level 1–5, years 0–60 | `CHECK` constraints |
| One level per person per skill | Composite PK on `user_skills` |
| Can't endorse a skill not on the profile | Composite FK to `user_skills` |
| Can't endorse yourself | `CHECK (endorser_id <> user_id)` |
| One application per person per project | `UNIQUE (project_id, applicant_id)` |
| Status is one of four values | `CHECK` on `applications.status` |
| Team never exceeds capacity | **Trigger** with `SELECT ... FOR UPDATE` |
| Exactly one leader per project | **Partial unique index** `WHERE role='LEADER'` |
| Accepting an application creates a membership | **Trigger** |

All ten are exercised in `tests/`, and the two concurrency tests run real
threads: two acceptances racing for the last slot, and two promotions racing for
leadership. Exactly one wins in each, which is the whole point of the row lock
and the partial index.

## API

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/register` | username, email, password (min 8) |
| `POST` | `/api/auth/login` | username **or** email |
| `POST` | `/api/auth/logout` | clears the session cookie |
| `GET` | `/api/auth/me` | current user, or 401 |
| `GET`/`PUT` | `/api/profile` | your own profile |
| `PUT` | `/api/profile/skills` | replace your skill set atomically |
| `GET` | `/api/profile/{username}` | public profile (no email) |
| `POST`/`DELETE` | `/api/profile/{username}/endorse/{skill_id}` | endorse / un-endorse |
| `GET` | `/api/skills` | vocabulary + how many people have each |
| `GET` | `/api/skills/categories` | skill categories |
| `GET` | `/api/search` | `skill` (repeatable), `min_level`, `require_all`, `q`, `limit`, `offset` |
| `GET` | `/api/people` | browse all |
| `GET`/`POST` | `/api/projects` | list / create |
| `GET`/`PUT`/`DELETE` | `/api/projects/{id}` | detail / update / delete (owner only) |
| `POST`/`DELETE` | `/api/projects/{id}/apply` | apply with a message / withdraw |
| `POST` | `/api/projects/{id}/applications/{app_id}/decide` | accept or reject (owner only) |
| `DELETE` | `/api/projects/{id}/members/me` | leave the team |
| `POST` | `/api/projects/{id}/members/{username}/promote` | transfer leadership |
| `POST` | `/api/projects/{id}/close` | close the project |
| `POST` | `/api/projects/{id}/updates` | post an update (members only) |

## The lifecycle

A project starts `OPEN` and its status is *derived from the roster*, never set
by hand:

- `OPEN` — just the leader
- `FORMING` — more than one member, not yet full
- `ACTIVE` — at capacity
- `CLOSED` — leader closed it (terminal)

Only `CLOSED` is set explicitly, and only by the leader.

## Search

`GET /api/search` takes a set of required skills, a minimum level, and whether
to require all of them. The ranking is one grouped join-and-aggregate in the
database:

```sql
SELECT users.id, count(DISTINCT user_skills.skill_id) AS matched,
       sum(user_skills.level) AS depth
FROM users JOIN user_skills ON user_skills.user_id = users.id
WHERE user_skills.skill_id IN (...) AND user_skills.level >= :min_level
GROUP BY users.id
HAVING count(DISTINCT user_skills.skill_id) = :n   -- when require_all
ORDER BY matched DESC, depth DESC
```

Coverage = `matched / required`. Partial matches come back ranked; `require_all`
restricts to full coverage.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `SKILLMATCH_DATABASE_URL` | `postgresql+psycopg://.../skillmatch` | database URL |
| `SKILLMATCH_SECRET` | dev placeholder | signs session cookies — **set in production** |
| `SKILLMATCH_COOKIE_SECURE` | off | set to `1` over HTTPS |
| `SKILLMATCH_SQL_ECHO` | off | log SQL, useful for demonstrating queries |

## Layout

```
app/
  config.py          env-driven settings
  database.py        engine, session factory, init_db
  models.py          the 11 tables and their constraints
  triggers.py        PL/pgSQL for capacity and accept-creates-membership
  auth.py            bcrypt, session cookie, current-user dependency
  skills_service.py  vocabulary lookup, skill-set replacement
  schemas.py         Pydantic request/response models
  routers/           auth, profiles, skills, search, projects
  main.py            app wiring, health, SPA fallback
tests/
  conftest.py        throwaway database per test
  test_auth.py       registration, login, sessions
  test_skills.py     vocabulary dedupe, endorsements
  test_search.py     coverage ranking
  test_projects.py   applications, decisions, lifecycle
  test_concurrency.py  the two race tests
```

## Theming

The entire visual language lives in one place: the `@theme` block at the top of
`frontend/src/index.css`. Components reference those values only through
Tailwind utilities (`bg-paper`, `text-ink`, `border-rule`, `text-signal`,
`font-display`), never as literal colours or font names.

That means a retheme is a single edit:

```css
@theme {
  --color-paper:  #f2f0e9;  /* page ground */
  --color-ink:    #000000;  /* text and rules */
  --color-signal: #0047ff;  /* the one accent */
  --font-display: "Archivo Black", sans-serif;
}
```

Change those values and the whole app changes with them. Verified: zero hex
literals and zero `var(--color-*)` references exist outside `index.css`.

Component behaviour (the ruled row, hover inversion, button and input
treatment) lives in the `@layer components` classes in the same file:
`.row`, `.btn`, `.field-input`, `.chip`, `.section-head`, `.block`.

## Known gaps

- No migrations — `create_all()` on startup. Add Alembic before the schema
  changes under live data.
- No rate limiting on login.
- No email verification or password reset.
- No frontend in this repo yet — the API is complete and documented at `/docs`.
