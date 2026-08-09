-- Chronix Phase 0 — Initial schema migration
-- Creates the UUIDv7 helper function, all ENUMs, all tables, and all indexes.
-- This migration is applied by Prisma Migrate on first deploy.

-- ─── UUIDv7 helper ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_uuidv7()
RETURNS uuid AS $$
  SELECT encode(
    set_bit(
      set_bit(
        overlay(uuid_send(gen_random_uuid()) PLACING
          substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
          FROM 1 FOR 6),
        52, 1),
      53, 0),
    'hex')::uuid;
$$ LANGUAGE sql VOLATILE;

-- ─── ENUMs ────────────────────────────────────────────────────────────────────

CREATE TYPE "WorkspaceRole" AS ENUM ('owner', 'admin', 'member', 'viewer');

CREATE TYPE "ApiKeyScope" AS ENUM (
  'schedules:read',
  'schedules:write',
  'executions:read',
  'executions:trigger',
  'admin'
);

CREATE TYPE "HttpMethod" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');

CREATE TYPE "ScheduleType"   AS ENUM ('cron', 'one_time');
CREATE TYPE "ScheduleStatus" AS ENUM ('active', 'paused', 'completed', 'error');
CREATE TYPE "MisfirePolicy"  AS ENUM ('coalesce', 'skip', 'catch_up');

CREATE TYPE "ExecutionStatus" AS ENUM (
  'pending', 'claimed', 'running', 'succeeded', 'failed', 'dead_lettered'
);
CREATE TYPE "TriggerType" AS ENUM ('scheduled', 'manual');

CREATE TYPE "AttemptOutcome" AS ENUM (
  'success', 'client_error', 'server_error', 'timeout',
  'network_error', 'ssrf_blocked', 'unknown'
);

CREATE TYPE "AuditActorType" AS ENUM ('account', 'api_key', 'system');

-- ─── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE accounts (
  id            UUID        NOT NULL DEFAULT generate_uuidv7() PRIMARY KEY,
  email         TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  display_name  TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT accounts_email_unique UNIQUE (email),
  CONSTRAINT accounts_email_format CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

CREATE TABLE refresh_tokens (
  id            UUID        NOT NULL DEFAULT generate_uuidv7() PRIMARY KEY,
  account_id    UUID        NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  token_hash    TEXT        NOT NULL,
  family_id     UUID        NOT NULL,
  revoked_at    TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT refresh_tokens_token_hash_unique UNIQUE (token_hash)
);

CREATE TABLE workspaces (
  id          UUID        NOT NULL DEFAULT generate_uuidv7() PRIMARY KEY,
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT workspaces_slug_unique UNIQUE (slug),
  CONSTRAINT workspaces_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9\-]{1,61}[a-z0-9]$')
);

CREATE TABLE workspace_memberships (
  id           UUID           NOT NULL DEFAULT generate_uuidv7() PRIMARY KEY,
  workspace_id UUID           NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  account_id   UUID           NOT NULL REFERENCES accounts (id)   ON DELETE CASCADE,
  role         "WorkspaceRole" NOT NULL DEFAULT 'member',
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  CONSTRAINT workspace_memberships_unique UNIQUE (workspace_id, account_id)
);

CREATE TABLE api_keys (
  id           UUID            NOT NULL DEFAULT generate_uuidv7() PRIMARY KEY,
  workspace_id UUID            NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name         TEXT            NOT NULL,
  key_hash     TEXT            NOT NULL,
  key_prefix   TEXT            NOT NULL,
  scopes       "ApiKeyScope"[] NOT NULL DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT api_keys_key_hash_unique UNIQUE (key_hash)
);

CREATE TABLE jobs (
  id               UUID          NOT NULL DEFAULT generate_uuidv7() PRIMARY KEY,
  workspace_id     UUID          NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name             TEXT          NOT NULL,
  description      TEXT,
  target_url       TEXT          NOT NULL,
  http_method      "HttpMethod"  NOT NULL DEFAULT 'POST',
  headers          JSONB         NOT NULL DEFAULT '{}',
  body_template    TEXT,
  timeout_ms       INTEGER       NOT NULL DEFAULT 30000,
  is_enabled       BOOLEAN       NOT NULL DEFAULT TRUE,
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT jobs_name_workspace_unique UNIQUE (workspace_id, name),
  CONSTRAINT jobs_timeout_range CHECK (timeout_ms BETWEEN 1000 AND 300000),
  CONSTRAINT jobs_target_url_format CHECK (target_url ~ '^https?://')
);

CREATE TABLE schedules (
  id                    UUID              NOT NULL DEFAULT generate_uuidv7() PRIMARY KEY,
  workspace_id          UUID              NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  job_id                UUID              NOT NULL REFERENCES jobs (id),
  name                  TEXT              NOT NULL,
  description           TEXT,
  schedule_type         "ScheduleType"    NOT NULL,
  cron_expression       TEXT,
  timezone              TEXT              NOT NULL DEFAULT 'UTC',
  run_at                TIMESTAMPTZ,
  next_run_at           TIMESTAMPTZ,
  status                "ScheduleStatus"  NOT NULL DEFAULT 'active',
  misfire_policy        "MisfirePolicy"   NOT NULL DEFAULT 'coalesce',
  max_retries           SMALLINT          NOT NULL DEFAULT 3,
  retry_backoff_base_ms INTEGER           NOT NULL DEFAULT 60000,
  last_claimed_at       TIMESTAMPTZ,
  last_claimed_by       TEXT,
  lease_expires_at      TIMESTAMPTZ,
  version               INTEGER           NOT NULL DEFAULT 0,
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  CONSTRAINT schedules_name_workspace_unique UNIQUE (workspace_id, name),
  CONSTRAINT schedules_cron_requires_expression
    CHECK (schedule_type <> 'cron' OR cron_expression IS NOT NULL),
  CONSTRAINT schedules_one_time_requires_run_at
    CHECK (schedule_type <> 'one_time' OR run_at IS NOT NULL),
  CONSTRAINT schedules_timezone_not_empty CHECK (timezone <> ''),
  CONSTRAINT schedules_max_retries_range CHECK (max_retries BETWEEN 0 AND 10),
  CONSTRAINT schedules_retry_backoff_range
    CHECK (retry_backoff_base_ms BETWEEN 1000 AND 3600000)
);

CREATE TABLE executions (
  id                    UUID               NOT NULL DEFAULT generate_uuidv7() PRIMARY KEY,
  workspace_id          UUID               NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  schedule_id           UUID               NOT NULL REFERENCES schedules (id),
  job_id                UUID               NOT NULL REFERENCES jobs (id),
  trigger_type          "TriggerType"      NOT NULL DEFAULT 'scheduled',
  triggered_by          UUID,
  nominal_run_at        TIMESTAMPTZ        NOT NULL,
  idempotency_key       TEXT               NOT NULL,
  status                "ExecutionStatus"  NOT NULL DEFAULT 'pending',
  attempt_count         SMALLINT           NOT NULL DEFAULT 0,
  max_retries           SMALLINT           NOT NULL,
  retry_backoff_base_ms INTEGER            NOT NULL,
  next_retry_at         TIMESTAMPTZ,
  lease_holder_id       TEXT,
  lease_expires_at      TIMESTAMPTZ,
  lease_generation      INTEGER            NOT NULL DEFAULT 0,
  terminal_at           TIMESTAMPTZ,
  version               INTEGER            NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

  CONSTRAINT executions_idempotency_key_unique UNIQUE (idempotency_key),
  CONSTRAINT executions_occurrence_unique      UNIQUE (schedule_id, nominal_run_at),
  CONSTRAINT executions_max_retries_range      CHECK (max_retries BETWEEN 0 AND 10),
  CONSTRAINT executions_lease_generation_check CHECK (lease_generation >= 0)
);

CREATE TABLE execution_attempts (
  id                    UUID             NOT NULL DEFAULT generate_uuidv7() PRIMARY KEY,
  execution_id          UUID             NOT NULL REFERENCES executions (id) ON DELETE CASCADE,
  workspace_id          UUID             NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  attempt_number        SMALLINT         NOT NULL,
  worker_id             TEXT             NOT NULL,
  started_at            TIMESTAMPTZ      NOT NULL,
  finished_at           TIMESTAMPTZ,
  outcome               "AttemptOutcome",
  http_status_code      SMALLINT,
  duration_ms           INTEGER,
  response_body_sample  TEXT,
  error_message         TEXT,
  idempotency_key       TEXT             NOT NULL,
  request_headers_sent  JSONB            NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

  CONSTRAINT execution_attempts_number_unique UNIQUE (execution_id, attempt_number)
);

CREATE TABLE execution_outbox (
  id            UUID        NOT NULL DEFAULT generate_uuidv7() PRIMARY KEY,
  execution_id  UUID        NOT NULL REFERENCES executions (id) ON DELETE CASCADE,
  event_type    TEXT        NOT NULL DEFAULT 'execution.created',
  event_version SMALLINT    NOT NULL DEFAULT 1,
  payload       JSONB       NOT NULL,
  published_at  TIMESTAMPTZ,
  attempts      SMALLINT    NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT execution_outbox_execution_unique UNIQUE (execution_id)
);

CREATE TABLE audit_events (
  id            UUID              NOT NULL DEFAULT generate_uuidv7() PRIMARY KEY,
  workspace_id  UUID              REFERENCES workspaces (id) ON DELETE SET NULL,
  actor_type    "AuditActorType"  NOT NULL,
  actor_id      UUID,
  event_type    TEXT              NOT NULL,
  resource_type TEXT,
  resource_id   UUID,
  metadata      JSONB             NOT NULL DEFAULT '{}',
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE TABLE worker_registrations (
  id              UUID        NOT NULL DEFAULT generate_uuidv7() PRIMARY KEY,
  worker_id       TEXT        NOT NULL,
  hostname        TEXT        NOT NULL,
  process_id      INTEGER     NOT NULL,
  version         TEXT        NOT NULL,
  queue_name      TEXT        NOT NULL,
  concurrency     SMALLINT    NOT NULL,
  last_heartbeat  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deregistered_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT worker_registrations_worker_id_unique UNIQUE (worker_id)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX idx_refresh_tokens_account_id ON refresh_tokens (account_id);
CREATE INDEX idx_refresh_tokens_family_id  ON refresh_tokens (family_id);
CREATE INDEX idx_refresh_tokens_expiry     ON refresh_tokens (expires_at) WHERE revoked_at IS NULL;

CREATE INDEX idx_workspace_memberships_account_id ON workspace_memberships (account_id);

CREATE INDEX idx_api_keys_workspace_id ON api_keys (workspace_id);

CREATE INDEX idx_jobs_workspace_id ON jobs (workspace_id) WHERE deleted_at IS NULL;

-- Scheduler hot path — CONCURRENTLY not supported inside a transaction; Prisma runs DDL in transactions,
-- so we use a regular CREATE INDEX here. Run CONCURRENTLY manually on existing large tables.
CREATE INDEX idx_schedules_claim ON schedules (next_run_at ASC)
  WHERE status = 'active' AND deleted_at IS NULL;

CREATE INDEX idx_schedules_workspace ON schedules (workspace_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_schedules_job_id ON schedules (job_id);

CREATE INDEX idx_executions_pending ON executions (created_at ASC)
  WHERE status = 'pending';

CREATE INDEX idx_executions_retry ON executions (next_retry_at ASC)
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;

CREATE INDEX idx_executions_workspace_history ON executions (workspace_id, created_at DESC);

CREATE INDEX idx_executions_schedule_id ON executions (schedule_id, created_at DESC);

CREATE INDEX idx_executions_lease_recovery ON executions (lease_expires_at ASC)
  WHERE status IN ('claimed', 'running');

CREATE INDEX idx_executions_job_id ON executions (job_id);

CREATE INDEX idx_execution_attempts_execution_id ON execution_attempts (execution_id, attempt_number ASC);
CREATE INDEX idx_execution_attempts_workspace     ON execution_attempts (workspace_id, started_at DESC);

CREATE INDEX idx_execution_outbox_unpublished ON execution_outbox (created_at ASC)
  WHERE published_at IS NULL;

CREATE INDEX idx_audit_events_workspace ON audit_events (workspace_id, created_at DESC);
CREATE INDEX idx_audit_events_actor     ON audit_events (actor_id, created_at DESC);

CREATE INDEX idx_worker_heartbeat_active ON worker_registrations (last_heartbeat DESC)
  WHERE deregistered_at IS NULL;
