#!/usr/bin/env bash
# =============================================================================
#  Deploys the LiveKit SFU for the Unknown app.
# -----------------------------------------------------------------------------
#  Renders infra/livekit.yaml from infra/.env, points LIVEKIT_URL at the rtc
#  subdomain, and brings the container up. Safe to re-run.
#
#  Run on the VPS:  bash /opt/unknown/scripts/deploy-livekit.sh
#
#  It does NOT touch the firewall — the media ports (3478, 7881, 50000-50100)
#  were already opened and are still in place.
# =============================================================================
set -euo pipefail

INFRA=/opt/unknown/infra
cd "$INFRA"

set -a
# shellcheck disable=SC1091
. ./.env
set +a

RTC_DOMAIN="${RTC_DOMAIN:-rtc.seemaai.co.uk}"

# --- 1. a real key/secret, not the placeholder the old stack shipped with ----
if [ -z "${LIVEKIT_API_SECRET:-}" ] || [ "${LIVEKIT_API_KEY:-}" = "unknown_dev_key" ]; then
  NEW_KEY="unknown_$(openssl rand -hex 6)"
  NEW_SECRET="$(openssl rand -hex 32)"
  sed -i "s|^LIVEKIT_API_KEY=.*|LIVEKIT_API_KEY=${NEW_KEY}|" .env
  sed -i "s|^LIVEKIT_API_SECRET=.*|LIVEKIT_API_SECRET=${NEW_SECRET}|" .env
  LIVEKIT_API_KEY="$NEW_KEY"
  LIVEKIT_API_SECRET="$NEW_SECRET"
  echo "generated a fresh LiveKit key pair"
else
  echo "keeping the existing LiveKit key pair"
fi

# --- 2. the API and the app must agree on the URL ---------------------------
sed -i "s|^LIVEKIT_URL=.*|LIVEKIT_URL=wss://${RTC_DOMAIN}|" .env
grep -q '^RTC_DOMAIN=' .env || echo "RTC_DOMAIN=${RTC_DOMAIN}" >> .env
echo "LIVEKIT_URL -> wss://${RTC_DOMAIN}"

# --- 3. render the config ---------------------------------------------------
sed -e "s|__API_KEY__|${LIVEKIT_API_KEY}|" \
    -e "s|__API_SECRET__|${LIVEKIT_API_SECRET}|" \
    livekit.yaml > livekit.rendered.yaml
mv livekit.rendered.yaml livekit.yaml
echo "livekit.yaml rendered (key ${LIVEKIT_API_KEY})"

# --- 4. up ------------------------------------------------------------------
docker compose up -d unknown-livekit
# The API mints room tokens, so it has to pick up the new key/secret.
docker compose up -d --force-recreate unknown-api

echo "waiting for LiveKit to come up…"
for _ in $(seq 1 20); do
  if curl -sf -o /dev/null "http://127.0.0.1:7880/"; then
    echo "LiveKit is answering on :7880"
    break
  fi
  sleep 2
done

docker ps --filter 'name=unknown-' --format 'table {{.Names}}\t{{.Status}}'
