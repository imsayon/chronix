ALTER TABLE workspaces ADD COLUMN retention_days SMALLINT NOT NULL DEFAULT 30;
ALTER TABLE workspaces ADD CONSTRAINT workspaces_retention_days_range CHECK (retention_days BETWEEN 1 AND 3650);
CREATE INDEX idx_executions_retention ON executions (workspace_id, terminal_at) WHERE terminal_at IS NOT NULL;
