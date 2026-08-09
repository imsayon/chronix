# Contributing to Chronix

Chronix favors correctness evidence over unchecked completion claims. Keep changes focused, preserve the two-bootstrap server shape, and add tests at the boundary where an invariant could regress.

## Development rules

- Use Node.js `24.19.0` and pnpm `11.21.0`.
- Keep `server/` and `client/` independently installable.
- Never commit `.env` files, credentials, generated Prisma output, build output, or private planning notes.
- Preserve the initial migration; evolve the schema with append-only migrations.
- Keep business rules in services and persistence in repositories. Express, BullMQ, and Next.js components must not invent domain behavior.
- Scope every tenant-owned repository query and mutation by `workspaceId`.
- Use parameterized Prisma SQL templates for the small set of concurrency queries that Prisma cannot express.

## Before opening a pull request

Run the complete commands documented in the root README. Integration tests require Docker and create isolated PostgreSQL 18/Valkey containers. Also run:

```bash
git diff --check
docker compose --file ops/docker-compose.yml config --quiet
```

Describe the invariant being changed, failure modes considered, migration/rollback impact, and the verification you actually ran. Do not mark live-provider checks complete without provider evidence.

## Commit and review shape

Use conventional commit subjects such as `fix(server): fence stale execution outcomes`. Prefer a few cohesive commits over either per-line commits or a single opaque dump. Phase branches are merged without squashing so architectural history remains reviewable.
