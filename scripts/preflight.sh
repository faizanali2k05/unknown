#!/usr/bin/env bash
# =============================================================================
#  UNKNOWN — Preflight port check. Verifies the host ports Unknown wants are
#  free on the live VPS BEFORE `docker compose up`. Read-only.
# -----------------------------------------------------------------------------
#  Run on the VPS:  bash scripts/preflight.sh
#  Reads ports from .env (falls back to defaults). Exits non-zero if any taken.
# =============================================================================
set -euo pipefail

ENV_FILE="${1:-.env}"
[ -f "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a

API_HOST_PORT="${API_HOST_PORT:-8090}"
LIVEKIT_HTTP_PORT="${LIVEKIT_HTTP_PORT:-7880}"
LIVEKIT_RTC_TCP_PORT="${LIVEKIT_RTC_TCP_PORT:-7881}"
TURN_LISTENING_PORT="${TURN_LISTENING_PORT:-3478}"

is_taken() { ss -tulpn 2>/dev/null | grep -qE ":$1\b"; }

fail=0
check() {
  local port="$1" label="$2"
  if is_taken "$port"; then
    printf '  ✗ %-26s port %s is TAKEN — pick another in .env\n' "$label" "$port"
    fail=1
  else
    printf '  ✓ %-26s port %s free\n' "$label" "$port"
  fi
}

echo "Preflight: checking host ports are free (n8n-safe)…"
check "$API_HOST_PORT"        "API_HOST_PORT"
check "$LIVEKIT_HTTP_PORT"    "LIVEKIT_HTTP_PORT (Phase 4)"
check "$LIVEKIT_RTC_TCP_PORT" "LIVEKIT_RTC_TCP_PORT (Phase 4)"
check "$TURN_LISTENING_PORT"  "TURN_LISTENING_PORT (Phase 4)"

echo
if [ "$fail" -ne 0 ]; then
  echo "Some ports are taken. Edit .env to free high ports, then re-run." >&2
  exit 1
fi
echo "All required host ports are free. Safe to bring up unknown_* services."
