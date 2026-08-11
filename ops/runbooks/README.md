# Chronix operations runbook

## Deploy

Deploy from `main` only after the server and client CI checks are green. The Render Blueprint runs Prisma migrations once through the API service `preDeployCommand`; scheduler and executor processes never migrate on startup.

Required dashboard values are `DATABASE_URL`, `APP_ENCRYPTION_KEY` (32-byte key), `API_KEY_HMAC_SECRET`, ES256 `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`, `CORS_ORIGIN`, and `NEXT_PUBLIC_API_URL`. Generate or copy them through the provider dashboard; never commit them. The Blueprint references the API's server-side values from the scheduler and executor so they cannot drift between processes.

## Health and rollback

- `/health/live` verifies process liveness.
- `/health/ready` verifies PostgreSQL and Valkey connectivity.
- `/metrics` exposes Prometheus metrics.
- Roll back to the previous Render deployment if readiness fails or scheduler/executor heartbeats stop; migrations are append-only and must be rolled forward with a compensating migration.

## Incident checks

1. Check API readiness, worker heartbeats, and recent redacted logs.
2. Inspect unpublished outbox count and execution lease expiry before replaying work.
3. For webhook failures, inspect attempt outcome, status, timeout, and bounded response sample; never paste Authorization headers into tickets.
4. Pause a schedule before changing a target or rotating its signing secret.

## Recovery guarantees

Delivery is durable at-least-once: schedule advancement, execution creation, and outbox insertion commit together; BullMQ publication is retry-safe and execution claims are fenced by lease generations. Consumers must deduplicate on `X-Chronix-Execution-Id` and `X-Chronix-Attempt-Number`.

The Blueprint uses paid Render starter services for the API, client, scheduler, executor, and Valkey. Hosted deployment, Grafana credentials, log routing, and billing approval remain external prerequisites until explicitly supplied.
