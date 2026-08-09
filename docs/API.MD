# Chronix HTTP API

The versioned API is rooted at `/api/v1`. JSON success responses use:

```json
{ "data": {}, "meta": { "requestId": "019f..." } }
```

Errors use:

```json
{ "error": { "code": "STABLE_CODE", "message": "Safe message", "details": [] }, "meta": { "requestId": "019f..." } }
```

The `X-Request-Id` response header matches `meta.requestId`. Clients may provide a valid request identifier; otherwise Chronix creates one. List endpoints are bounded and cursor-paginated.

The machine-readable contract is served at `/api/v1/openapi.json` as OpenAPI 3.1 and is generated from the runtime Zod schemas.

## Resource groups

| Resource | Base route | Purpose |
|---|---|---|
| Auth | `/auth` | Register, login, refresh, logout, current identity |
| Workspaces | `/workspaces` | Tenant and membership administration |
| API keys | `/workspaces/:workspaceId/api-keys` | Dashboard-only key lifecycle |
| Jobs | `/workspaces/:workspaceId/jobs` | Webhook target definitions |
| Schedules | `/workspaces/:workspaceId/schedules` | Cron and one-time trigger lifecycle |
| Executions | `/workspaces/:workspaceId/executions` | Execution history and attempt details |
| Workers | `/workspaces/:workspaceId/workers` | Recent executor registrations |

## Authentication

Interactive clients send `Authorization: Bearer <ES256 access token>` and receive a rotating refresh token in an HttpOnly cookie. Programmatic clients send a scoped `chx_live_...` API key in the same header. API keys cannot create or revoke API keys.

Authentication never replaces tenant authorization: every resource operation also checks the requested workspace and the required role or scope.

## Sensitive material and exports

`POST /workspaces/:workspaceId/jobs` returns a generated `signingSecret` exactly once. `POST /workspaces/:workspaceId/jobs/:jobId/signing-secret/rotate` returns the replacement exactly once. Headers and body templates are encrypted at rest and redacted from API responses.

`GET /workspaces/:workspaceId/executions/export?limit=10000` streams a bounded CSV export of workspace-scoped execution history.

## Idempotency and delivery

Manual trigger requests return HTTP `202` with an execution identifier. Retried trigger requests use idempotency semantics so one logical request cannot create unbounded duplicate executions.

Outbound webhooks include stable Chronix execution, attempt, schedule, job, workspace, idempotency, and signature headers. Delivery is at-least-once; receivers should persist the idempotency key before applying side effects.

Runtime Zod schemas are the OpenAPI source, so documentation and validation cannot drift independently.
