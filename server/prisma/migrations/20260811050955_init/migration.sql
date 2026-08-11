-- DropForeignKey
ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "execution_attempts" DROP CONSTRAINT "execution_attempts_execution_id_fkey";

-- DropForeignKey
ALTER TABLE "execution_attempts" DROP CONSTRAINT "execution_attempts_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "execution_outbox" DROP CONSTRAINT "execution_outbox_execution_id_fkey";

-- DropForeignKey
ALTER TABLE "executions" DROP CONSTRAINT "executions_job_id_fkey";

-- DropForeignKey
ALTER TABLE "executions" DROP CONSTRAINT "executions_schedule_id_fkey";

-- DropForeignKey
ALTER TABLE "executions" DROP CONSTRAINT "executions_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_account_id_fkey";

-- DropForeignKey
ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "schedules" DROP CONSTRAINT "schedules_job_id_fkey";

-- DropForeignKey
ALTER TABLE "schedules" DROP CONSTRAINT "schedules_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "workspace_memberships" DROP CONSTRAINT "workspace_memberships_account_id_fkey";

-- DropForeignKey
ALTER TABLE "workspace_memberships" DROP CONSTRAINT "workspace_memberships_workspace_id_fkey";

-- DropIndex
DROP INDEX "idx_execution_attempts_execution_id";

-- DropIndex
DROP INDEX "idx_executions_lease_recovery";

-- DropIndex
DROP INDEX "idx_executions_retention";

-- DropIndex
DROP INDEX "idx_jobs_workspace_id";

-- DropIndex
DROP INDEX "idx_refresh_tokens_expiry";

-- AlterTable
ALTER TABLE "accounts" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "api_keys" ALTER COLUMN "scopes" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "audit_events" ALTER COLUMN "ip_address" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "executions" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "jobs" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "refresh_tokens" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "schedules" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "worker_registrations" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "workspace_memberships" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "workspaces" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "idx_executions_lease_recovery" ON "executions"("lease_expires_at") WHERE (status IN ('claimed', 'running'));

-- CreateIndex
CREATE INDEX "jobs_workspace_id_idx" ON "jobs"("workspace_id");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_attempts" ADD CONSTRAINT "execution_attempts_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_attempts" ADD CONSTRAINT "execution_attempts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_outbox" ADD CONSTRAINT "execution_outbox_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "accounts_email_unique" RENAME TO "accounts_email_key";

-- RenameIndex
ALTER INDEX "api_keys_key_hash_unique" RENAME TO "api_keys_key_hash_key";

-- RenameIndex
ALTER INDEX "idx_api_keys_workspace_id" RENAME TO "api_keys_workspace_id_idx";

-- RenameIndex
ALTER INDEX "execution_attempts_number_unique" RENAME TO "execution_attempts_execution_id_attempt_number_key";

-- RenameIndex
ALTER INDEX "execution_outbox_execution_unique" RENAME TO "execution_outbox_execution_id_key";

-- RenameIndex
ALTER INDEX "executions_idempotency_key_unique" RENAME TO "executions_idempotency_key_key";

-- RenameIndex
ALTER INDEX "executions_occurrence_unique" RENAME TO "executions_schedule_id_nominal_run_at_key";

-- RenameIndex
ALTER INDEX "idx_executions_job_id" RENAME TO "executions_job_id_idx";

-- RenameIndex
ALTER INDEX "jobs_name_workspace_unique" RENAME TO "jobs_workspace_id_name_key";

-- RenameIndex
ALTER INDEX "idx_refresh_tokens_account_id" RENAME TO "refresh_tokens_account_id_idx";

-- RenameIndex
ALTER INDEX "idx_refresh_tokens_family_id" RENAME TO "refresh_tokens_family_id_idx";

-- RenameIndex
ALTER INDEX "refresh_tokens_token_hash_unique" RENAME TO "refresh_tokens_token_hash_key";

-- RenameIndex
ALTER INDEX "idx_schedules_job_id" RENAME TO "schedules_job_id_idx";

-- RenameIndex
ALTER INDEX "schedules_name_workspace_unique" RENAME TO "schedules_workspace_id_name_key";

-- RenameIndex
ALTER INDEX "worker_registrations_worker_id_unique" RENAME TO "worker_registrations_worker_id_key";

-- RenameIndex
ALTER INDEX "idx_workspace_memberships_account_id" RENAME TO "workspace_memberships_account_id_idx";

-- RenameIndex
ALTER INDEX "workspace_memberships_unique" RENAME TO "workspace_memberships_workspace_id_account_id_key";

-- RenameIndex
ALTER INDEX "workspaces_slug_unique" RENAME TO "workspaces_slug_key";
