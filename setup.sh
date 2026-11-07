#!/usr/bin/env bash
# One-click setup for OGTB Donation Map.
#   1. Detects / installs Node.js, Docker (+ Compose), curl  (Windows: winget, macOS: brew, Linux: apt/dnf)
#   2. Starts the Docker engine and creates .env with random secrets (existing values are kept)
#   3. Installs npm modules on the host for every package.json found (skipped when already in sync)
#   4. Runs `docker compose up -d`, waits for DB -> API -> Web, seeds admin/user accounts
#   5. Tests the database (read/write/schema), the API through the web proxy, then the unit/integration suites
# Every run is logged to logs/setup-<timestamp>.log (+ container logs in logs/compose-<timestamp>.log).
#
# Usage: ./setup.sh [--skip-tests] [--help]
set -Eeuo pipefail

cd "$(dirname "$0")"
export MSYS_NO_PATHCONV=1 # Git Bash: don't rewrite container paths such as /app

SKIP_TESTS=0
for arg in "$@"; do
  case "$arg" in
    --skip-tests) SKIP_TESTS=1 ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (see --help)"; exit 2 ;;
  esac
done

mkdir -p logs
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="logs/setup-$STAMP.log"
COMPOSE_LOG="logs/compose-$STAMP.log"
exec > >(tee -a "$LOG_FILE") 2>&1

START_TS=$(date +%s)
log()  { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
step() { printf '\n[%s] ==> %s\n' "$(date +%H:%M:%S)" "$*"; }
ok()   { log "  OK   $*"; }
skip() { log "  SKIP $*"; }
warn() { log "  WARN $*"; }
die()  { log "  FAIL $*"; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

on_error() {
  local code=$?
  log "Setup failed (exit $code, line $1)."
  if [ "${STACK_STARTED:-0}" = 1 ]; then
    docker compose logs --no-color --tail 300 >"$COMPOSE_LOG" 2>&1 || true
    log "Container logs: $COMPOSE_LOG"
  fi
  log "Full log: $LOG_FILE"
}
trap 'on_error $LINENO' ERR

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) OS=windows ;;
  Darwin) OS=mac ;;
  Linux) OS=linux ;;
  *) die "Unsupported OS: $(uname -s)" ;;
esac
SUDO=""; if [ "$OS" = linux ] && [ "$(id -u)" != 0 ]; then SUDO="sudo"; fi

log "OGTB Donation Map setup  |  OS: $OS  |  log: $LOG_FILE"

# Windows installers don't refresh PATH of this shell; add the usual install dirs up front.
if [ "$OS" = windows ]; then
  LOCAL_APPDATA="$(cygpath -u "${LOCALAPPDATA:-$USERPROFILE/AppData/Local}" 2>/dev/null || true)"
  for dir in "/c/Program Files/nodejs" "/c/Program Files/Docker/Docker/resources/bin" \
             "$LOCAL_APPDATA/Programs/DockerDesktop/resources/bin" "$LOCAL_APPDATA/Microsoft/WindowsApps"; do
    [ -d "$dir" ] && case ":$PATH:" in *":$dir:"*) ;; *) PATH="$dir:$PATH" ;; esac
  done
  export PATH
fi

pkg_install() { # pkg_install <winget-id> <brew-args> <apt/dnf package>
  case "$OS" in
    windows)
      have winget || die "winget not found. Install 'App Installer' from Microsoft Store, then re-run."
      winget install -e --id "$1" --accept-source-agreements --accept-package-agreements --silent ;;
    mac)
      have brew || die "Homebrew not found. Install it from https://brew.sh then re-run."
      # shellcheck disable=SC2086
      brew install $2 ;;
    linux)
      if have apt-get; then $SUDO apt-get update -y && $SUDO apt-get install -y "$3"
      elif have dnf; then $SUDO dnf install -y "$3"
      else die "No apt-get/dnf found. Install '$3' manually, then re-run."; fi ;;
  esac
}

# ---------------------------------------------------------------- prerequisites
step "1/7 Checking prerequisites"

if have curl; then ok "curl $(curl --version | head -1 | cut -d' ' -f2)"; else log "  installing curl..."; pkg_install cURL.cURL curl curl; fi

node_ok() { # Prisma 7 needs Node ^20.19 || ^22.12 || >=24
  have node && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>=24||(a===22&&b>=12)||(a===20&&b>=19)||a===23?0:1)'
}
if node_ok; then
  ok "Node.js $(node -v) / npm $(npm -v 2>/dev/null || echo '?')"
else
  have node && warn "Node.js $(node -v) is too old (need 20.19+, 22.12+ or 24+)"
  log "  installing Node.js LTS..."
  if [ "$OS" = linux ] && have apt-get; then
    curl -fsSL https://deb.nodesource.com/setup_lts.x | $SUDO -E bash - && $SUDO apt-get install -y nodejs
  else
    pkg_install OpenJS.NodeJS.LTS node nodejs
  fi
  hash -r
  node_ok || die "Node.js installed but not usable in this shell yet. Open a new terminal and re-run."
  ok "Node.js $(node -v) installed"
fi

if have docker; then
  ok "Docker CLI $(docker --version | sed 's/Docker version //')"
else
  log "  installing Docker..."
  case "$OS" in
    windows)
      if ! wsl.exe --status >/dev/null 2>&1; then
        log "  enabling WSL2 (required by Docker Desktop)..."
        wsl.exe --install --no-distribution || true
        die "WSL2 was just enabled. Restart Windows, then run setup again."
      fi
      pkg_install Docker.DockerDesktop "" "" ;;
    mac) pkg_install "" "--cask docker" "" ;;
    linux)
      curl -fsSL https://get.docker.com | $SUDO sh
      [ -n "$SUDO" ] && $SUDO usermod -aG docker "$USER" || true ;;
  esac
  for dir in "/c/Program Files/Docker/Docker/resources/bin" "${LOCAL_APPDATA:-}/Programs/DockerDesktop/resources/bin"; do
    [ -d "$dir" ] && PATH="$dir:$PATH"
  done
  hash -r
  have docker || die "Docker installed but not on PATH yet. Open a new terminal and re-run."
  ok "Docker installed"
fi

# Linux without docker-group membership (e.g. right after install): fall back to sudo.
if [ "$OS" = linux ] && ! docker info >/dev/null 2>&1 && $SUDO docker info >/dev/null 2>&1; then
  docker() { $SUDO command docker "$@"; }
fi

# ---------------------------------------------------------------- docker engine
step "2/7 Starting Docker engine"
if docker info >/dev/null 2>&1; then
  ok "Docker engine already running"
else
  case "$OS" in
    windows)
      if ! docker desktop start >/dev/null 2>&1; then
        exe=""
        for c in "/c/Program Files/Docker/Docker/Docker Desktop.exe" "${LOCAL_APPDATA:-}/Programs/DockerDesktop/Docker Desktop.exe"; do
          [ -f "$c" ] && exe="$c" && break
        done
        [ -n "$exe" ] || die "Docker Desktop.exe not found"
        "$exe" >/dev/null 2>&1 &
      fi ;;
    mac) open -a Docker ;;
    linux) $SUDO systemctl start docker || $SUDO service docker start ;;
  esac
  log "  waiting for Docker engine (accept the Docker Desktop terms window if it appears)..."
  for _ in $(seq 1 90); do docker info >/dev/null 2>&1 && break; sleep 2; done
  docker info >/dev/null 2>&1 || die "Docker engine did not start within 3 minutes"
  ok "Docker engine running"
fi
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 plugin missing (docker compose)"
ok "$(docker compose version)"

# ---------------------------------------------------------------- env files
step "3/7 Preparing configuration"
rand_hex() { openssl rand -hex "$1" 2>/dev/null || node -e "console.log(require('crypto').randomBytes($1).toString('hex'))"; }
env_get() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | tr -d '\r'; }
set_placeholder() { # replace a value only while it is still the .env.example placeholder or empty
  local key="$1" value="$2" current
  current="$(env_get "$key" || true)"
  if [ -z "$current" ] || [[ "$current" == replace-* ]]; then
    if grep -qE "^$key=" .env; then sed -i.bak "s|^$key=.*|$key=$value|" .env && rm -f .env.bak
    else printf '%s=%s\n' "$key" "$value" >>.env; fi
    log "  generated $key"
  fi
}

if [ -f .env ]; then ok ".env exists (kept)"; else cp .env.example .env; ok ".env created from .env.example"; fi
set_placeholder JWT_SECRET "$(rand_hex 32)"
set_placeholder SEED_ADMIN_PASSWORD "Admin-$(rand_hex 6)"
set_placeholder SEED_USER_PASSWORD "User-$(rand_hex 6)"
if [ -f backend/.env ]; then ok "backend/.env exists (kept)"; else cp .env backend/.env; ok "backend/.env created (for running the API without Docker)"; fi

FRONTEND_PORT="$(env_get FRONTEND_PORT || true)"; FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_PORT="$(env_get BACKEND_PORT || true)"; BACKEND_PORT="${BACKEND_PORT:-4000}"
WEB="http://localhost:$FRONTEND_PORT"
API="http://localhost:$BACKEND_PORT"

# Fail early (before npm ci wipes node_modules under a running dev server) if another program holds our ports.
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
for entry in "frontend:$FRONTEND_PORT" "backend:$BACKEND_PORT" "db:5432"; do
  svc="${entry%%:*}"; port="${entry##*:}"
  if port_busy "$port" && [ -z "$(docker compose ps -q --status running "$svc" 2>/dev/null)" ]; then
    case "$svc" in
      frontend) hint="or set FRONTEND_PORT (and FRONTEND_URL) in .env" ;;
      backend) hint="or set BACKEND_PORT in .env" ;;
      *) hint="(e.g. a local PostgreSQL service)" ;;
    esac
    die "Port $port is used by another program, not this project's $svc. Stop it $hint, then re-run."
  fi
done
ok "ports $FRONTEND_PORT, $BACKEND_PORT, 5432 available"

# ---------------------------------------------------------------- host npm modules
step "4/7 Installing npm modules on this machine (editor tooling / running without Docker)"
# Containers keep their own Linux node_modules in volumes; these host copies never reach them.
for pkg in */package.json; do
  dir="$(dirname "$pkg")"
  stamp="$dir/node_modules/.package-lock.json"
  if [ -f "$stamp" ] && [ "$stamp" -nt "$pkg" ] && { [ ! -f "$dir/package-lock.json" ] || [ "$stamp" -nt "$dir/package-lock.json" ]; }; then
    ok "$dir modules already installed"
    continue
  fi
  log "  installing $dir modules..."
  if [ -f "$dir/package-lock.json" ]; then (cd "$dir" && npm ci --no-audit --no-fund)
  else (cd "$dir" && npm install --no-audit --no-fund); fi
  ok "$dir modules installed"
done

# ---------------------------------------------------------------- start stack
step "5/7 Starting containers (first run installs npm packages, can take several minutes)"
STACK_STARTED=1
backend_was_running="$(docker compose ps -q --status running backend 2>/dev/null || true)"
docker compose up -d --remove-orphans
if [ -n "$backend_was_running" ]; then
  # node --watch can't see edits made on a Windows/macOS host through the bind mount; reload code now.
  log "  restarting backend to load current code..."
  docker compose restart backend
fi

wait_for() { # wait_for <label> <timeout-seconds> <command...>
  local label="$1" timeout="$2" waited=0; shift 2
  until "$@" >/dev/null 2>&1; do
    if [ "$waited" -ge "$timeout" ]; then die "$label not ready after ${timeout}s (see $COMPOSE_LOG)"; fi
    for svc in db backend frontend; do
      cid="$(docker compose ps -aq "$svc" 2>/dev/null)"
      [ -n "$cid" ] || continue
      [ "$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null)" = exited ] || continue
      state="$(docker inspect -f 'exit={{.State.ExitCode}} oomKilled={{.State.OOMKilled}} {{.State.Error}}' "$cid")"
      docker compose logs --no-color --tail 60 "$svc" || true
      warn "container '$svc' stopped ($state)"
      case "$state" in
        *oomKilled=true*) warn "out of memory: raise Docker Desktop > Settings > Resources > Memory (4 GB+ recommended)" ;;
        exit=137*) warn "exit 137 = process was killed (often low memory; check Docker Desktop > Settings > Resources)" ;;
      esac
      # One automatic retry: dev servers occasionally die on first boot (cold npm install / cache upgrade).
      case " ${RETRIED:-} " in
        *" $svc "*) die "container '$svc' stopped again ($state) - see log above and $COMPOSE_LOG" ;;
      esac
      RETRIED="${RETRIED:-} $svc"
      if [ "$svc" = frontend ]; then
        # A stale .next volume (old Next version's Turbopack cache / dev lock) can kill `next dev`
        # silently right after boot; it's only a cache, so rebuild it from scratch.
        next_vol="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/.next"}}{{.Name}}{{end}}{{end}}' "$cid")"
        docker compose rm -sf frontend >/dev/null
        [ -n "$next_vol" ] && docker volume rm "$next_vol" >/dev/null && log "  cleared Next.js cache volume $next_vol"
      fi
      log "  restarting $svc once..."
      docker compose up -d "$svc"
    done
    sleep 5; waited=$((waited + 5))
    [ $((waited % 30)) -eq 0 ] && log "  ...still waiting for $label (${waited}s)"
  done
  ok "$label ready"
}
db_healthy() { [ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q db)")" = healthy ]; }
wait_for "PostgreSQL" 180 db_healthy
wait_for "API $API/health" 900 curl -fsS -m 5 "$API/health"
wait_for "Web $WEB" 900 curl -fsS -m 120 "$WEB/"

# Dev server compiles each route on first visit; warm them now so the first click isn't slow.
log "  pre-compiling pages..."
for route in /login /register /donations/new /admin /admin/users /admin/donations /admin/reports; do
  curl -fsS -m 180 "$WEB$route" >/dev/null 2>&1 || warn "could not pre-compile $route"
done
ok "pages pre-compiled"

log "  seeding admin/user accounts..."
docker compose exec -T backend npm run --silent db:seed
ok "seed accounts ready"

# ---------------------------------------------------------------- tests
step "6/7 Testing database and API"
FAILED=0
check() { # check <label> <command...>
  local label="$1"; shift
  if out="$("$@" 2>&1)"; then ok "$label"; else FAILED=$((FAILED + 1)); log "  FAIL $label"; printf '%s\n' "$out" | tail -20; fi
}
psql_db() { docker compose exec -T db psql -v ON_ERROR_STOP=1 -U ogtb -d ogtb_donation_map -qtA "$@"; }

check "DB accepts connections" docker compose exec -T db pg_isready -U ogtb -d ogtb_donation_map
check "DB schema has User/Donation/DonationImage/Report tables" bash -c '[ "$(docker compose exec -T db psql -U ogtb -d ogtb_donation_map -qtAc "select count(*) from information_schema.tables where table_schema='"'"'public'"'"' and table_name in ('"'"'User'"'"','"'"'Donation'"'"','"'"'DonationImage'"'"','"'"'Report'"'"')")" = 4 ]'
check "DB migrations all applied" bash -c '[ "$(docker compose exec -T db psql -U ogtb -d ogtb_donation_map -qtAc "select count(*) from _prisma_migrations where finished_at is null or rolled_back_at is not null")" = 0 ]'
check "DB write/read round-trip" bash -c '[ "$(docker compose exec -T db psql -v ON_ERROR_STOP=1 -U ogtb -d ogtb_donation_map -qtA -c "create temp table setup_probe(v int)" -c "insert into setup_probe values (42)" -c "select v from setup_probe")" = 42 ]'
log "  DB size: $(psql_db -c "select pg_size_pretty(pg_database_size(current_database()))" | tr -d '\r') | users: $(psql_db -c 'select count(*) from "User"' | tr -d '\r') | donations: $(psql_db -c 'select count(*) from "Donation"' | tr -d '\r')"

# Relative path on purpose: native Windows curl cannot open MSYS paths like /tmp/... (no path conversion here).
JAR="logs/.cookies-$STAMP"
check "API health" curl -fsS -m 10 "$API/health"
check "Web -> API proxy: GET /api/donations" bash -c "curl -fsS -m 30 '$WEB/api/donations' | grep -q '^\['"
check "Anonymous /api/auth/me is rejected (401)" bash -c "curl -s -m 10 -w '\n%{http_code}' '$WEB/api/auth/me' | tail -1 | grep -qx 401"
ADMIN_PASSWORD="$(env_get SEED_ADMIN_PASSWORD)"
check "Admin login through web proxy" curl -fsS -m 20 -c "$JAR" -H 'content-type: application/json' \
  -d "{\"email\":\"admin@ogtb.local\",\"password\":\"$ADMIN_PASSWORD\"}" "$WEB/api/auth/login"
check "Admin session reads users from DB" bash -c "curl -fsS -m 20 -b '$JAR' '$WEB/api/admin/users' | grep -q 'admin@ogtb.local'"
rm -f "$JAR"

if [ "$SKIP_TESTS" = 1 ]; then
  skip "backend/frontend test suites (--skip-tests)"
else
  log "  running backend test suite against the database (about 2 minutes)..."
  check "Backend tests (npm test in container)" docker compose exec -T backend npm test
  check "Frontend unit tests (npm test in container)" docker compose exec -T frontend npm test
fi

# ---------------------------------------------------------------- summary
step "7/7 Summary"
docker compose ps
docker compose logs --no-color --tail 300 >"$COMPOSE_LOG" 2>&1 || true
cat <<EOF

  Web app      : $WEB
  API health   : $API/health
  Admin login  : admin@ogtb.local / SEED_ADMIN_PASSWORD in .env
  User login   : user@ogtb.local  / SEED_USER_PASSWORD in .env
  Setup log    : $LOG_FILE
  Container log: $COMPOSE_LOG
  Stop         : docker compose down      (add -v to also wipe the database)
  Follow logs  : docker compose logs -f
  Took         : $(( $(date +%s) - START_TS ))s
EOF

if [ "$FAILED" -gt 0 ]; then
  log "$FAILED check(s) failed - details above and in $LOG_FILE"
  exit 1
fi
log "All checks passed. The app is running."
