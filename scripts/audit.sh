#!/usr/bin/env bash
# =============================================================================
#  UNKNOWN — Phase 0 live audit (READ-ONLY). Changes nothing on the VPS.
# -----------------------------------------------------------------------------
#  Run on the VPS:   bash scripts/audit.sh | tee /tmp/unknown_audit.txt
#  Produces an inventory of containers, networks, volumes, taken ports, the
#  proxy fronting n8n, and n8n's network/volume names (to provably avoid).
# =============================================================================
set -euo pipefail

line() { printf '\n=== %s ===\n' "$1"; }

line "Running containers"
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'

line "All containers (incl stopped)"
docker ps -a --format 'table {{.Names}}\t{{.Status}}'

line "Networks"
docker network ls
for n in $(docker network ls --format '{{.Name}}' | grep -vE '^(bridge|host|none)$'); do
  printf -- '--- %s ---\n' "$n"
  docker network inspect "$n" --format '{{range .Containers}}{{.Name}} {{end}}'
done

line "Volumes"
docker volume ls

line "Host listening ports"
ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null || echo "ss/netstat unavailable"

line "80/443 owner"
ss -tulpn 2>/dev/null | grep -E ':80\b|:443\b' || echo "nothing on 80/443"

line "Ports Unknown cares about (must be FREE before use)"
for p in 8090 7880 7881 50000 50100 50200 50300 3478; do
  if ss -tulpn 2>/dev/null | grep -qE ":$p\b"; then
    echo "  port $p : TAKEN"
  else
    echo "  port $p : free"
  fi
done

line "Proxy container?"
docker ps --format '{{.Names}} {{.Image}}' | grep -iE 'caddy|nginx|traefik|proxy' || echo "none detected"

line "n8n details (network + ports to AVOID)"
docker ps --format '{{.Names}}' | grep -i n8n | while read -r c; do
  echo "container: $c"
  docker inspect "$c" --format 'net={{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}} ports={{.NetworkSettings.Ports}}'
done || echo "no n8n container found by name"

line "Existing unknown_* resources (should be empty on a clean server)"
docker ps -a --format '{{.Names}}' | grep -E '^unknown_' || echo "  none (good)"
docker network ls --format '{{.Name}}' | grep -E '^unknown' || echo "  no unknown network (good)"
docker volume ls --format '{{.Name}}' | grep -E '^unknown' || echo "  no unknown volumes (good)"

line "Firewall"
sudo ufw status 2>/dev/null || echo "ufw inactive/absent"

line "Resources"
free -h || true
df -h / || true

line "AUDIT COMPLETE"
echo "Review the inventory before Phase 1. Confirm 80/443 owner and n8n's"
echo "network/volume names, then proceed with unknown_* resources only."
