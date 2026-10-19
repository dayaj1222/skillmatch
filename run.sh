#!/usr/bin/env bash
#
# SkillMatch local dev launcher (Linux). Starts Postgres if needed, creates the
# role/database, installs dependencies, then runs the API + Vite dev server.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
PG_PORT="${SKILLMATCH_PG_PORT:-5433}"
API_PORT="${SKILLMATCH_API_PORT:-8766}"
WEB_PORT="${SKILLMATCH_WEB_PORT:-5173}"
PG_USER="${SKILLMATCH_PG_USER:-$(whoami)}"
PG_DATABASE="${SKILLMATCH_PG_DATABASE:-skillmatch}"
PGDATA="${SKILLMATCH_PGDATA:-$HOME/.local/share/pgdata}"

if ! command -v pg_ctl >/dev/null 2>&1; then
  echo "PostgreSQL is required. Install it with: sudo pacman -S postgresql" >&2
  exit 1
fi

if ! pg_isready -h 127.0.0.1 -p "$PG_PORT" >/dev/null 2>&1; then
  mkdir -p "$(dirname "$PGDATA")"
  if [[ ! -f "$PGDATA/PG_VERSION" ]]; then
    initdb -D "$PGDATA" -U "$(whoami)" --auth=trust >/dev/null
  fi
  pg_ctl -D "$PGDATA" -o "-p $PG_PORT" -l "$PGDATA/server.log" start >/dev/null
fi

createuser -h 127.0.0.1 -p "$PG_PORT" "$PG_USER" 2>/dev/null || true
createdb -h 127.0.0.1 -p "$PG_PORT" -O "$PG_USER" "$PG_DATABASE" 2>/dev/null || true
psql -h 127.0.0.1 -p "$PG_PORT" -d postgres \
  -c "ALTER DATABASE \"$PG_DATABASE\" OWNER TO \"$PG_USER\";" >/dev/null

cd "$ROOT_DIR"
uv sync

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  (cd "$FRONTEND_DIR" && npm install)
fi

cleanup() {
  trap - EXIT INT TERM
  [[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

uv run uvicorn app.main:app --host 127.0.0.1 --port "$API_PORT" &
API_PID=$!

(cd "$FRONTEND_DIR" && npm run dev -- --host 127.0.0.1 --port "$WEB_PORT") &
WEB_PID=$!

echo "SkillMatch is running:"
echo "  Frontend: http://127.0.0.1:$WEB_PORT/"
echo "  API docs: http://127.0.0.1:$API_PORT/docs"
echo "Press Ctrl+C to stop the application servers."

wait "$API_PID" "$WEB_PID"
