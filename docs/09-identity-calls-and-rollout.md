# Identity, contacts, calling and safe rollout

This work keeps the existing Expo UI and NestJS/Prisma/PostgreSQL/Socket.IO/LiveKit stack. It does not move data to another database or replace the deployed front proxy.

## Database rollout

The additive migration `20261003000100_public_ids_and_friendships` backfills a unique `KASSI-` public ID for each existing account, adds friend requests/friendships/blocks, records call state, and adds meetings. A temporary database trigger also fills IDs for legacy API images during rollback. The migration does not delete account or conversation rows. Take and verify a PostgreSQL backup before applying it, then run from `apps/server` with the production environment loaded:

```sh
npm ci
npm run prisma:generate
npm run prisma:deploy
npm run build
```

Deploy the API only after `prisma:deploy` succeeds. Newly issued access-token subjects are public IDs; the API temporarily accepts the prior UUID subject so already-issued short-lived access tokens can expire naturally.

## Exact, one-time test-account cleanup

The cleanup script is opt-in, defaults to dry-run, requires the exact usernames, and refuses to delete if any requested username does not exist. First inspect and confirm the listed accounts are disposable, and take a verified database backup:

```sh
cd apps/server
node --env-file=../../infra/.env scripts/cleanup-test-users.mjs --usernames=demo_user,test_account
```

Only after reviewing that output, run the same command with `--confirm`. The transaction removes those users' direct conversations, authored messages, initiated call rows, memberships, friend/block rows and refresh tokens (via database cascades), while preserving groups used by other accounts. It does not guess which real accounts are test users and must not be run with a broad selector. MinIO objects are not deleted: existing message media URLs do not carry reliable ownership metadata, so deleting blobs by guess would risk unrelated users' files.

## IDs, contacts and authorization

- Public IDs are generated server-side, unique/indexed, and separate from internal UUIDs. The API response, realtime events, call participant identities, and new JWT subjects use public IDs instead of exposing user UUIDs.
- User lookup is exact-ID-only and throttled; there is no user directory endpoint. Friends, requests, blocks, and exact-ID-only group invitation APIs are available in the existing Contacts and New Group screens.
- Direct messages/calls require an accepted, unblocked friendship. Conversation membership is checked for message history, read state, typing, calls, and group operations.
- Meeting links are unguessable 96-bit random codes, require sign-in, expire after four hours, and may only be ended by their creator.

## Calling and TURN notes

The application uses LiveKit as an SFU, not a browser/native peer-to-peer mesh. The web call screen publishes real browser media through that SFU; it is not a mock. Explicit ringing/answered/rejected/missed/ended/failed states are persisted, and unanswered calls time out after 45 seconds. LiveKit provides UDP media and TCP fallback.

The deployment uses LiveKit's embedded TURN (rather than a second Coturn container), authenticated by the existing LiveKit API credentials. Required inbound ports are UDP 3478 (TURN/UDP), TCP 5349 (TURN/TLS), TCP 7881 (ICE/TCP fallback), and UDP 50000–50100 (media). Signaling uses the existing HTTPS host via the app-only Nginx vhost; port 7880 is private to the Docker bridge and the admin `/twirp` API is not publicly proxied. `infra/turnserver.conf` is a sanitized, unused Coturn template. A static secret was previously present in that tracked template; rotate it before any future Coturn deployment, since removal from the working tree does not remove it from Git history.

Set `APP_URL=https://unknown.5kassi.com` for meeting-link sharing. Web clients can also use their current origin; native clients use the `unknown://` app deep link if the API does not return an HTTPS URL.

## Multi-application VPS safeguards

Deployment must target only Compose project `unknown` under `/opt/unknown`. Do not prune Docker, stop other projects, replace global proxy configuration, or run the cleanup script until exact demo/test usernames have been reviewed. Keep PostgreSQL, Redis and MinIO on the existing private network/volumes. The current server-side Coturn template alone does not change any listening port or firewall rule.
