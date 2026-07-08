# Unknown — convenience targets. All compose calls use project `unknown`.
COMPOSE = docker compose -p unknown
MEDIA   = docker compose -p unknown -f docker-compose.yml -f docker-compose.media.yml

.PHONY: help audit preflight secrets up-data up-api up logs ps n8n-check down media-up

help:
	@echo "audit      - read-only VPS inventory (Phase 0)"
	@echo "secrets    - generate strong secrets into .env"
	@echo "preflight  - verify chosen host ports are free"
	@echo "up-data    - start postgres + redis + minio (no host ports)"
	@echo "up-api     - build + start the API"
	@echo "up         - start the whole data+API stack"
	@echo "media-up   - start LiveKit + coturn (Phase 4; firewall = confirm-before)"
	@echo "logs       - tail API logs"
	@echo "n8n-check  - prove n8n is still healthy"
	@echo "down       - stop unknown_* (leaves n8n untouched)"

audit:
	bash scripts/audit.sh

secrets:
	bash scripts/gen-secrets.sh

preflight:
	bash scripts/preflight.sh

up-data:
	$(COMPOSE) up -d unknown_postgres unknown_redis unknown_minio

up-api:
	$(COMPOSE) up -d --build unknown_api

up: up-data up-api
	$(COMPOSE) ps

media-up:
	$(MEDIA) up -d unknown_livekit unknown_coturn

logs:
	$(COMPOSE) logs -f unknown_api

ps:
	$(COMPOSE) ps

n8n-check:
	@docker ps --format '{{.Names}}\t{{.Status}}' | grep -i n8n || echo "no n8n container by name"

down:
	$(COMPOSE) down
