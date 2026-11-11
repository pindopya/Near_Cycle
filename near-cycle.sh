#!/usr/bin/env bash
# Near_Cycle lifecycle: ./near-cycle.sh start | stop
# Runs docker-compose, idempotent WON import, and a managed Cloudflare Quick Tunnel.
set -Eeuo pipefail
cd "$(dirname "$0")"
ROOT="$PWD"
RUNTIME="$ROOT/logs/near-cycle-runtime"
mkdir -p "$RUNTIME"
TUNNEL_PID="$RUNTIME/tunnel.pid"
TUNNEL_URL="$RUNTIME/tunnel.url"
TUNNEL_LOG="$RUNTIME/tunnel.log"
TUNNEL_ORIGIN="$RUNTIME/tunnel.origin"
LOCK="$RUNTIME/.operation.lock"
COMPOSE_BIN=""
USE_COLIMA=0

say(){ printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
fail(){ say "ERROR: $*"; exit 1; }
has(){ command -v "$1" >/dev/null 2>&1; }
is_pid(){ [ -n "${1:-}" ] && [[ "$1" =~ ^[0-9]+$ ]] && kill -0 "$1" 2>/dev/null; }
port_value(){
  local k="$1" fallback="$2" v=""
  if [ -f .env ]; then v="$(grep -E "^$k=" .env | tail -1 | cut -d= -f2- | tr -d '\r' || true)"; fi
  printf '%s' "${v:-$fallback}"
}
acquire(){
  if ! mkdir "$LOCK" 2>/dev/null; then fail "Another near-cycle.sh operation is running; lock at $LOCK"; fi
  trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT
}
choose_compose(){
  if docker compose version >/dev/null 2>&1; then COMPOSE_BIN="plugin"
  elif has docker-compose; then COMPOSE_BIN="standalone"
  else fail "Docker Compose not installed"; fi
}
compose(){
  if [ "$COMPOSE_BIN" = "plugin" ]; then docker compose "$@"; else docker-compose "$@"; fi
}
# Credentials for anonymous public image pulls. Does not overwrite the host's Docker config.
docker_prepare(){
  has docker || fail "Docker CLI missing"
  if docker info >/dev/null 2>&1; then :
  elif has colima; then
    say "Starting Colima Docker engine..."
    colima start --cpu 2 --memory 4 || fail "Colima did not start"
    export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
    USE_COLIMA=1
  else fail "Docker Engine unavailable. Start Docker Desktop or install Colima"; fi
  if ! docker info >/dev/null 2>&1; then
    if [ -S "$HOME/.colima/default/docker.sock" ]; then
      export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
      USE_COLIMA=1
    fi
  fi
  docker info >/dev/null 2>&1 || fail "Cannot connect to Docker Engine"
  # desktop credentials helper can exist even when Docker Desktop has been removed.
  if [ -f "$HOME/.docker/config.json" ] && grep -q '"credsStore"[[:space:]]*:[[:space:]]*"desktop"' "$HOME/.docker/config.json"; then
    local cfg="$RUNTIME/docker-config"
    mkdir -p "$cfg"; chmod 700 "$cfg"
    printf '{"auths":{}}\n' > "$cfg/config.json"
    export DOCKER_CONFIG="$cfg"
    # Context details are in the original config; explicit socket instead.
    if [ -z "${DOCKER_HOST:-}" ] && [ -S "$HOME/.colima/default/docker.sock" ]; then
      export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
    fi
  fi
  choose_compose
}
secure_value(){ if has openssl; then openssl rand -hex "$1"; else node -e "console.log(require('node:crypto').randomBytes($1).toString('hex'))"; fi; }
set_placeholder(){
  local key="$1" value="$2" current
  current="$(port_value "$key" "")"
  # Only replace missing or repository placeholders; never overwrite custom secrets.
  if [ -z "$current" ] || [[ "$current" == replace-* ]]; then
    if grep -q "^$key=" .env; then
      # Key and generated value contain no sed-sensitive characters.
      sed -i.bak "s|^$key=.*|$key=$value|" .env
      rm -f .env.bak
    else printf '%s=%s\n' "$key" "$value" >> .env; fi
  fi
}
prepare_env(){
  if [ ! -f .env ]; then
    [ -f .env.example ] || fail ".env and .env.example both missing"
    cp .env.example .env
    chmod 600 .env
    say "Created .env from template"
  fi
  set_placeholder JWT_SECRET "$(secure_value 32)"
  set_placeholder SEED_ADMIN_PASSWORD "Admin-$(secure_value 12)"
  set_placeholder SEED_USER_PASSWORD "User-$(secure_value 12)"
}
await_http(){
  local label="$1" url="$2" timeout="$3" elapsed=0
  while [ "$elapsed" -lt "$timeout" ]; do
    if curl -fsS -o /dev/null --max-time 8 "$url"; then say "OK $label"; return 0; fi
    sleep 4; elapsed=$((elapsed+4))
  done
  compose logs --tail 40 backend frontend || true
  fail "$label not responding ($url)"
}
# Limit stop to only the process recorded by this script, never other Cloudflare tunnels.
managed_tunnel_alive(){
  [ -f "$TUNNEL_PID" ] || return 1
  local pid
  pid="$(cat "$TUNNEL_PID")"
  is_pid "$pid" || return 1
  ps -p "$pid" -o command= 2>/dev/null | grep -q 'cloudflared tunnel'
}
stop_tunnel(){
  if managed_tunnel_alive; then
    local pid
    pid="$(cat "$TUNNEL_PID")"
    kill "$pid" 2>/dev/null || true
    for _ in 1 2 3 4 5; do is_pid "$pid" || break; sleep 1; done
    say "Stopped managed Cloudflare Tunnel"
  fi
  rm -f "$TUNNEL_PID" "$TUNNEL_URL" "$TUNNEL_ORIGIN"
}
public_http(){
  local url="$1" code host ip
  code="$(curl -sSL -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 10 "$url" 2>/dev/null || true)"
  if [[ "$code" =~ ^(200|301|302|303|307|308)$ ]]; then return 0; fi
  # macOS occasionally fails local DNS for fresh trycloudflare.com domains.
  # Verify through public DNS and the actual HTTPS endpoint with SNI intact.
  has dig || return 1
  host="${url#https://}"; host="${host%%/*}"
  [[ "$host" =~ ^[a-z0-9-]+\.trycloudflare\.com$ ]] || return 1
  ip="$(dig +time=2 +tries=1 +short @1.1.1.1 "$host" 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1 || true)"
  [ -n "$ip" ] || return 1
  code="$(curl -sSL --resolve "$host:443:$ip" -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 12 "$url" 2>/dev/null || true)"
  [[ "$code" =~ ^(200|301|302|303|307|308)$ ]]
}
start_tunnel(){
  has cloudflared || fail "cloudflared missing (brew install cloudflared)"
  local origin="http://127.0.0.1:$(port_value FRONTEND_PORT 3000)"
  if managed_tunnel_alive && [ -f "$TUNNEL_URL" ] && [ -f "$TUNNEL_ORIGIN" ] &&
     [ "$(cat "$TUNNEL_ORIGIN")" = "$origin" ]; then
    local existing
    existing="$(cat "$TUNNEL_URL")"
    if public_http "$existing"; then
      say "Reusing managed Tunnel"
      printf '\nPublic URL: %s\nLocal URL : %s\n' "$existing" "$origin"
      return 0
    fi
    say "Stored Tunnel URL unresponsive; replacing managed Tunnel"
  fi
  stop_tunnel
  : > "$TUNNEL_LOG"
  nohup cloudflared tunnel --no-autoupdate --protocol http2 --url "$origin" > "$TUNNEL_LOG" 2>&1 < /dev/null &
  local pid=$!
  echo "$pid" > "$TUNNEL_PID"
  echo "$origin" > "$TUNNEL_ORIGIN"
  local url="" elapsed=0
  while [ "$elapsed" -lt 60 ]; do
    is_pid "$pid" || { tail -n 20 "$TUNNEL_LOG"; fail "Tunnel process exited"; }
    url="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1 || true)"
    [ -n "$url" ] && break
    sleep 2; elapsed=$((elapsed+2))
  done
  [ -n "$url" ] || { tail -n 20 "$TUNNEL_LOG"; fail "No Cloudflare Quick Tunnel URL received"; }
  echo "$url" > "$TUNNEL_URL"
  # Cloudflare Quick Tunnel DNS may take time to propagate. Fail instead of printing a bogus confirmed URL.
  elapsed=0
  while [ "$elapsed" -lt 90 ]; do
    if public_http "$url"; then
      say "Tunnel HTTP check passed"
      printf '\nPublic URL: %s\nLocal URL : %s\n' "$url" "$origin"
      return 0
    fi
    sleep 5; elapsed=$((elapsed+5))
  done
  say "WARNING: Cloudflare connector generated URL but public HTTP could not be verified (possibly DNS propagation)."
  say "Tunnel process remains running; log: $TUNNEL_LOG"
  printf 'Unverified Tunnel URL: %s\nLocal URL: %s\n' "$url" "$origin"
  return 2
}
start(){
  acquire
  docker_prepare
  prepare_env
  say "Starting Near_Cycle compose stack..."
  compose up -d --remove-orphans
  local webport apiport
  webport="$(port_value FRONTEND_PORT 3000)"
  apiport="$(port_value BACKEND_PORT 4000)"
  await_http "Backend API" "http://127.0.0.1:$apiport/health" 360
  await_http "Frontend" "http://127.0.0.1:$webport/" 360
  say "Checking recycling drop point data..."
  compose exec -T backend node scripts/won-import/import.mjs --validate
  compose exec -T backend node scripts/won-import/import.mjs --dry-run
  compose exec -T backend node scripts/won-import/import.mjs --apply --confirm
  say "Recycling drop point import up to date"
  start_tunnel
}
stop(){
  acquire
  stop_tunnel
  if has docker; then
    docker_prepare
    say "Stopping Near_Cycle containers (volumes preserved)..."
    compose down --remove-orphans
  else say "Docker CLI missing; tunnel stopped but containers could not be stopped"; fi
  say "Near_Cycle stopped. PostgreSQL volume preserved."
}
case "${1:-}" in
  start) start;;
  stop) stop;;
  *) printf 'Usage: ./near-cycle.sh {start|stop}\n'; exit 2;;
esac
