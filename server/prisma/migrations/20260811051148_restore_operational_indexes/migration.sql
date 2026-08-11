-- DropIndex
DROP INDEX "idx_executions_lease_recovery";

-- CreateIndex
CREATE INDEX "idx_executions_lease_recovery" ON "executions"("lease_expires_at") WHERE (status IN ('claimed', 'running'));

-- CreateIndex
CREATE INDEX "idx_executions_retention" ON "executions"("workspace_id", "terminal_at") WHERE (terminal_at IS NOT NULL);

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_expiry" ON "refresh_tokens"("expires_at");
