# Chronix architecture

## System shape

Chronix separates control-plane HTTP traffic from background scheduling and delivery while sharing one domain implementation:

- `client/`: Next.js dashboard. It communicates only through `/api/v1`.
- `server/src/app.ts`: Express API bootstrap.
- `server/src/worker.ts`: scheduler or executor bootstrap selected by `WORKER_ROLE`.
- `server/src/common/`: configuration, errors, authentication context, HTTP primitives, IDs, and pagination.
- `server/src/modules/`: domain services, repositories, and route adapters.
- `server/src/infra/`: PostgreSQL, Valkey/BullMQ, delivery, health, and telemetry adapters.

No other file is an executable bootstrap. Generated Prisma code is a build artifact and is never committed.

## Data and delivery flow

1. A client mutation reaches a Zod-validated API route.
2. The service checks identity, role/scope, and workspace ownership.
3. PostgreSQL persists the domain mutation.
4. The scheduler claims due rows without blocking other scheduler instances.
5. Schedule advancement, execution creation, and outbox insertion commit atomically.
6. The outbox publisher sends the execution identifier to BullMQ and records publication.
7. An executor claims the execution with a time-bounded lease and fencing generation.
8. The executor delivers the webhook, appends an attempt, and conditionally records the result.

PostgreSQL remains authoritative at every step. A queue message is a notification to inspect database state, not proof that work is still eligible.

## Reliability model

Chronix provides at-least-once delivery. Duplicate queue publication and worker retries are expected. The execution's stable idempotency key lets a cooperating webhook receiver deduplicate side effects. Exactly-once delivery cannot be guaranteed across an HTTP boundary without receiver participation.

The scheduler uses `FOR UPDATE SKIP LOCKED`, optimistic versions, and a unique `(schedule_id, nominal_run_at)` constraint. Executors use expiring leases and `lease_generation` fencing so a stale worker cannot overwrite a reclaimed execution.

## Security boundaries

- Tenant resources are queried and mutated with explicit `workspaceId` predicates.
- Dashboard sessions use short-lived ES256 access tokens and rotating refresh cookies.
- API keys are workspace-scoped and permission-scoped.
- Webhook URLs are validated at configuration and delivery time; delivery-time address pinning is the final DNS-rebinding boundary.
- Logs and API DTOs must not expose credential material or persistence models directly.

## Deployment ownership

Migrations are applied exactly once by a deployment task. API, scheduler, and executor processes only connect to the already-migrated schema. Readiness checks PostgreSQL and Valkey with time bounds; liveness only proves the process can serve HTTP.
