# Architecture decisions

## ADR-001 — Supported runtime baseline

**Status:** Accepted, 2026-08-09

Chronix uses Node.js 24.19.0 LTS, TypeScript 6.0.3, and pnpm 11.21.0. The previous Node 25/TypeScript 7 prototype baseline was non-LTS and outside TypeScript-ESLint's supported compiler range. Exact runtime and direct dependency pins make CI, containers, and local verification comparable.

## ADR-002 — Generated Prisma client policy

**Status:** Accepted, 2026-08-09

Generated Prisma files are build artifacts. They are ignored by Git and regenerated explicitly before every server source consumer. The schema and append-only SQL migrations are reviewed source; generated output is not.

## ADR-003 — Migrations belong to deployment

**Status:** Accepted, 2026-08-09

API and worker processes never run migrations at startup. A one-shot deployment task runs `prisma migrate deploy` before application processes become eligible to start. This prevents horizontally scaled processes from racing schema ownership and makes failed migrations visible as deployment failures.
