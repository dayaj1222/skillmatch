#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
PG_PORT="${SKILLMATCH_PG_PORT:-5433}"
API_PORT="${SKILLMATCH_API_PORT:-8766}"
WEB_PORT="${SKILLMATCH_WEB_PORT:-5173}"
PG_USER="${SKILLMATCH_PG_USER:-daya}"
PG_DATABASE="${SKILLMATCH_PG_DATABASE:-skillmatch}"
USER_HOME_DIR="$(dscl . -read /Users/"$(whoami)" NFSHomeDirectory 2>/dev/null | awk '{print $2}')"
USER_HOME_DIR="${USER_HOME_DIR:-$HOME}"
PGDATA="${SKILLMATCH_PGDATA:-$USER_HOME_DIR/.local/share/pgdata}"

PG_BIN="$(brew --prefix postgresql@16 2>/dev/null)/bin"
if [[ ! -x "$PG_BIN/pg_ctl" ]]; then
  echo "PostgreSQL 16 is required. Install it with: brew install postgresql@16" >&2
  exit 1
fi

if ! "$PG_BIN/pg_isready" -h 127.0.0.1 -p "$PG_PORT" >/dev/null 2>&1; then
  mkdir -p "$(dirname "$PGDATA")"
  if [[ ! -f "$PGDATA/PG_VERSION" ]]; then
    "$PG_BIN/initdb" -D "$PGDATA" -U "$(whoami)" --auth=trust >/dev/null
  fi
  "$PG_BIN/pg_ctl" -D "$PGDATA" -o "-p $PG_PORT" -l "$PGDATA/server.log" start >/dev/null
fi

"$PG_BIN/createuser" -h 127.0.0.1 -p "$PG_PORT" "$PG_USER" 2>/dev/null || true
"$PG_BIN/createdb" -h 127.0.0.1 -p "$PG_PORT" -O "$PG_USER" "$PG_DATABASE" 2>/dev/null || true
"$PG_BIN/psql" -h 127.0.0.1 -p "$PG_PORT" -d postgres -c "ALTER DATABASE \"$PG_DATABASE\" OWNER TO \"$PG_USER\";" >/dev/null

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
