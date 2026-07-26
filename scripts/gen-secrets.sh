#!/usr/bin/env bash
# =============================================================================
#  UNKNOWN — Generate strong random secrets into .env (idempotent-ish).
# -----------------------------------------------------------------------------
#  Usage:  bash scripts/gen-secrets.sh        # creates/fills .env from example
#  Replaces every __CHANGE_ME...__ placeholder with a fresh random value.
#  Never commit the resulting .env.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

[ -f .env ] || { cp .env.example .env; echo "Created .env from .env.example"; }

rand_hex() { openssl rand -hex 32; }       # 64 hex chars
rand_pw()  { openssl rand -base64 24 | tr -d '/+=' | cut -c1-28; }

# Replace each placeholder type with a distinct fresh secret.
replace_first() {
  # replace_first <placeholder> <value>  — replaces only the first occurrence
  local ph="$1" val="$2"
  # Use a temp file for portable in-place edit (Linux/macOS).
  awk -v ph="$ph" -v val="$val" '
    !done && index($0, ph) { sub(ph, val); done=1 }
    { print }
  ' .env > .env.tmp && mv .env.tmp .env
}

# Strong passwords (used in two places each: var + DATABASE_URL/S3).
PG_PW="$(rand_pw)"
MINIO_PW="$(rand_pw)"

# Fill all generic 64-hex secrets one by one.
while grep -q '__CHANGE_ME_64_HEX__' .env; do
  replace_first '__CHANGE_ME_64_HEX__' "$(rand_hex)"
done

# Postgres password appears as a STRONG placeholder in two spots.
while grep -q '__CHANGE_ME_STRONG__' .env; do
  # First two STRONG = postgres (var + URL); next two = minio (var + nothing).
  replace_first '__CHANGE_ME_STRONG__' "$PG_PW"
done

echo "Secrets generated into .env."
echo "NOTE: review DATABASE_URL — its password must match POSTGRES_PASSWORD."
echo "      (gen fills the first STRONG placeholders with one PG password;"
echo "       confirm both POSTGRES_PASSWORD and DATABASE_URL line up.)"
