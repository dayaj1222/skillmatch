# SkillMatch frontend redesign — handoff

**Status: PARTIALLY DONE.** The design system and 3 of 7 surfaces are converted. 4 pages still carry the old brutalist inline classes and will look wrong next to the converted ones. This document is the exact state, so any agent can finish it.

---

## 1. What this task is

The user asked to redesign the app to be "softer and more visible professional" using the **frontend-design** skill (`/home/daya/.pi/agent/skills/frontend-design/SKILL.md`). Decisions already made with the user:

- **Full app redesign** — every surface, one coherent world.
- **Keep current information density** — do not loosen spacing materially.
- **Use the frontend-design skill** as the design authority.
- **Do not use native `<select>` dropdowns** — theme them or build custom React components. (Done: a `Select` component exists; 4 native selects remain.)
- **Schema graph should start at MAX zoom** (done).
- The user can render and view the frontend via headless Chromium (see section 6).

---

## 2. The new design system (DONE — do not redo)

File: `frontend/src/index.css` — completely rewritten. This is the single source of truth.

### Direction: "the match"
The product's subject is *fit* — a person against a project's needs, skill by skill. The one idea the UI spends boldness on is the **coverage track** (level ticks / coverage numbers). Everything else is quiet.

Deliberately **NOT** the warm-cream + serif + terracotta Claude cliche.

### Tokens (Tailwind `@theme` block, all become utilities)

```
--color-paper    #ffffff   page ground
--color-surface  #f6f7f9   cool off-white, recessed blocks
--color-ink      #14161a   blue-black
--color-rule     #e3e7ed   hairline border
--color-rule-strong #c9d0da
--color-muted    #5b6472
--color-faint    #98a1ae
--color-field    #ffffff
--color-inverse  #ffffff
--color-signal   #2b4eff   the one accent (focus, links, active nav, level ticks)
--color-match    #0e8f6e   full coverage
--color-partial  #b45309   partial coverage
--color-gap      #c2410c   shortfall
--color-open     #2b4eff   lifecycle (semantic only)
--color-forming  #b45309
--color-active   #0e8f6e
--color-closed   #5b6472
--color-deny     #c2410c
--font-sans      "Inter", system-ui, ...
--font-display   "Newsreader", Georgia, serif   (serif — titles ONLY)
--radius-xs/sm/md 4px / 6px / 10px
--border-width-rule 1px
```

### Component classes (in `@layer components` in the same file)

`.display` (serif title, sentence case, NOT uppercase) · `.btn` `.btn-primary` `.btn-secondary` `.btn-ghost` `.btn-danger` · `.field-label` `.field-input` `.field-help` `.field-error` · `.block` · `.panel-instrument` (tinted controls panel) · `.register` (list, hairline separators, no per-row box) · `.row` `.row-dim` · `.chip` (tinted pill, lowercase) · `.combo-menu` `.combo-option` `.combo-count` · `.section-head` (quiet label + underline, NOT a black band) · `.track` `.track-seg` (coverage track) · `.tnum`

### Fonts (DONE)

`frontend/index.html` loads `Inter` + `Newsreader` (replaced Archivo/Archivo Black).

---

## 3. Files ALREADY converted (DONE — verify, don't redo)

| File | What changed |
|---|---|
| `frontend/src/index.css` | Full rewrite (above) |
| `frontend/index.html` | Font swap |
| `frontend/src/components/AppShell.tsx` | Sentence-case nav, `NavUnderline` active marker (signal underline, not black block), quiet footer ("SkillMatch — a team-finder for small projects.") |
| `frontend/src/components/ui.tsx` | `LevelTicks` (blue signal ticks), `SectionHead` (quiet), **new `Select` component** + `Caret` + `Check`. `SkeletonRows` still uses `border-t-3` — **needs updating to `border-t`**. |
| `frontend/src/pages/Projects.tsx` | Rewritten: serif title, filter bar with `Select`, register rows, chips for skills |
| `frontend/src/pages/Search.tsx` | Rewritten: `.panel-instrument` controls, `.register` results, coverage numbers (`held/required` in match/partial color), `LEVEL_OPTIONS`, `Select` for min level. `PersonRow` uses `hover:bg-surface`, serif names, `text-gap` for "Short on" |
| `frontend/src/components/SchemaGraph.tsx` | Zoom now defaults to `MAX_ZOOM` (2), `clampZoom` helper, `MIN_ZOOM`/`MAX_ZOOM` consts, zoom buttons/Reset/pinch all use `clampZoom`. `TableBox` rect now uses `className="fill-paper stroke-signal|stroke-ink"` instead of hex literals. **Still has `border-3`, `text-[0.6875rem]`, `uppercase tracking-[...]` in the header — see section 4.** |

---

## 4. Files STILL TO CONVERT (the actual work)

These still contain old brutalist classes. **Search for `border-3`, `border-x-3`, `border-b-3`, `border-t-3`, `uppercase`, `tracking-[`, `font-bold`** and replace per the mapping in section 5.

| File | Known remaining issues |
|---|---|
| `frontend/src/pages/Profile.tsx` | 2 native `<select>` (skill level, add-skill level) -> use `Select`. Uses `border-x-3 border-b-3`, `uppercase tracking-[...]` labels, `.chip text-ink`. |
| `frontend/src/pages/ProjectDetail.tsx` | Many `border-3`/`border-x-3`, `uppercase` meta lines ("LED BY @x / STARTED..."), black `.chip`, `ApplyForm`/`InviteForm`/`ApplicantRow`/`UpdateComposer` all use `border-3 border-rule`. |
| `frontend/src/pages/ProjectForm.tsx` | 2 native `<select>` (min level per skill, add-skill min level) -> `Select`. `border-3 border-rule`, `divide-y divide-rule border-x-3`. |
| `frontend/src/pages/Schema.tsx` | `border-3 border-rule`, `uppercase tracking-[0.06em]` labels, `.chip text-ink`. Uses `SectionHead`. |
| `frontend/src/components/SchemaGraph.tsx` | Header row: `text-[0.6875rem] uppercase tracking-[0.06em]`, buttons `h-7 w-7`. Box labels use `text-xs uppercase`-ish inline styles. Hover/pan/zoom logic is fine — only restyle. |
| `frontend/src/components/ui.tsx` | `SkeletonRows` still `border-t-3 border-rule` -> change to `border-t border-rule`. |

Also check: `frontend/src/pages/Login.tsx`, `Register.tsx`, `NotFound.tsx` for stray `border-3`/`uppercase` (less likely — they were themed earlier).

---

## 5. Old -> new class mapping (apply mechanically)

| Old (brutalist) | New |
|---|---|
| `border-3 border-rule` | `border border-rule rounded-md` (or `.block` class) |
| `border-x-3 border-b-3 border-rule` | `border border-rule rounded-md` OR wrap list in `.register` |
| `border-t-3` / `border-b-3` | `border-t` / `border-b` |
| `border-rule` (as 3px) | `border-rule` (now 1px via token) |
| `uppercase tracking-[0.06em]` on labels | delete both; use `.field-label` or plain `text-muted` |
| `font-bold uppercase tracking-[0.04em]` on buttons | handled by `.btn` already — delete inline |
| `text-[0.6875rem] uppercase tracking-[0.06em] text-faint` | `text-[0.8125rem] text-faint` |
| `.chip text-ink` / `text-signal` | `.chip text-muted` (or semantic: `text-match`/`text-partial`) |
| `bg-ink text-inverse` (nav active) | signal underline via `NavUnderline` pattern |
| `divide-y divide-rule` + `border-x-3` | `.register` wrapper |
| native `<select className="field-input ...">` | `<Select value=... onChange=... options={[{value,label}]} />` from `../components/ui` |
| `text-[0.75rem] uppercase tracking-[0.06em]` (meta) | `text-[0.8125rem] text-muted` |

**Serif rule:** `.display` is now a *serif, sentence case* class. Anywhere it was used for uppercase labels, that is now wrong — labels should be plain sans `text-muted`.

---

## 6. How to see your work (the user explicitly wants this used)

Headless Chromium is at:

```
~/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell
```

Screenshot a page:

```bash
cd /tmp && ~/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell \
  --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --window-size=1440,1050 --virtual-time-budget=3000 \
  --screenshot=/tmp/out.png 'http://127.0.0.1:8766/search'
```

Then `read` the PNG to view it. `magick` and `ffmpeg` are available for conversion.

Run the app:

```bash
cd /home/daya/Development/skillmatch
# Postgres (user-owned cluster):
PGROOT=$HOME/.local/share/pgdata; pg_ctl -D $PGROOT -o "-p 5433 -k /tmp" -l $PGROOT/server.log start
uv run uvicorn app.main:app --host 127.0.0.1 --port 8766
```

The frontend is served from `frontend/` build output into `static/`. To rebuild:

```bash
cd frontend && npx vite build      # writes ../static/assets/*
```

The server serves `static/` directly, so a rebuild is enough — no server restart needed.

---

## 7. Verification (must pass before claiming done)

```bash
cd /home/daya/Development/skillmatch/frontend && npx tsc --noEmit   # must be clean
cd /home/daya/Development/skillmatch/frontend && npx vite build     # must succeed
cd /home/daya/Development/skillmatch && uv run ruff check .         # must be clean (backend untouched)
cd /home/daya/Development/skillmatch && uv run pytest -q            # 68 tests must pass
```

**Do not run two pytest processes at once** — they share the `skillmatch_pytest` DB and will collide.

---

## 8. Design rules to keep (from frontend-design skill)

- **Serif is for titles and human names only.** Never labels, never buttons, never uppercase.
- **Sentence case everywhere.** No ALL-CAPS labels (the skill lists tracked-out ALL-CAPS eyebrows as a #1 AI tell).
- **One accent** (`--color-signal`). Match/partial/gap are semantic, not decorative.
- **The instrument/register split** is the key hierarchy device: controls sit in a tinted `.panel-instrument`; lists are `.register` (hairline-separated rows, NOT cards).
- **Do not add gradient washes, shadows on everything, or the same radius on every element.**
- Level ticks carry `bg-signal` when filled — a person's strength should read before their skill names do.

---

## 9. Not yet done / known gaps

- 4 pages unconverted (see section 4) — **this is the main outstanding work.**
- `ui.tsx` `SkeletonRows` still 3px.
- The 4 native selects in Profile/ProjectForm.
- No PRODUCT.md or DESIGN.md exist for the impeccable skill (I used `frontend-design` instead, per the user's answer). If a future agent runs `impeccable`, it will ask to init.
- The schema graph restyle is cosmetic-only; interaction (pan/zoom/hover-isolate) is finished and working.
