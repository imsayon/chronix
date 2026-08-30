import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { startTestDatabase } from "../../test/integration-environment.js";
import * as jobsRepository from "../jobs/jobs.repository.js";
import * as schedulesRepository from "../schedules/schedules.repository.js";
import { processExecution } from "./worker.service.js";
import { claimExecution, recoverStaleLease, recordOutcome } from "./executions.repository.js";

let database: PrismaClient;
let stopDatabase: () => Promise<void>;
const workspaceId = randomUUID();
const workerId = "test-worker-1";

beforeAll(async () => {
  const environment = await startTestDatabase();
  database = environment.database;
  stopDatabase = environment.stop;
  await database.workspace.create({
    data: { id: workspaceId, name: "Worker Test", slug: "worker-test" },
  });
});

beforeEach(async () => {
  await database.executionAttempt.deleteMany();
  await database.executionOutbox.deleteMany();
  await database.execution.deleteMany();
  await database.schedule.deleteMany();
  await database.job.deleteMany();
});

afterAll(async () => stopDatabase?.());

async function createExecution(input: {
  suffix: string;
  attemptCount?: number;
  maxRetries: number;
}) {
  const job = await jobsRepository.insertJob(database, {
    workspaceId,
    name: `Job ${input.suffix}`,
    targetUrl: `https://${input.suffix}.example.com/webhook`,
    httpMethod: "POST",
    headers: { Authorization: "Bearer test" },
    bodyTemplate: '{"hello":"world"}',
    timeoutMs: 5_000,
  });
  const schedule = await schedulesRepository.insertSchedule(database, {
    workspaceId,
    jobId: job.id,
    name: `Schedule ${input.suffix}`,
    scheduleType: "one_time",
    timezone: "UTC",
    runAt: new Date(),
    nextRunAt: new Date(),
    maxRetries: input.maxRetries,
    retryBackoffBaseMs: 1_000,
  });
  const execution = await database.execution.create({
    data: {
      workspaceId,
      scheduleId: schedule.id,
      jobId: job.id,
      triggerType: "manual",
      nominalRunAt: new Date(),
      idempotencyKey: `test-${input.suffix}`,
      status: "pending",
      attemptCount: input.attemptCount ?? 0,
      maxRetries: input.maxRetries,
      retryBackoffBaseMs: 1_000,
    },
  });
  await database.executionOutbox.create({
    data: { executionId: execution.id, payload: { executionId: execution.id } },
  });
  return execution;
}

describe("worker service integration", () => {
  it("records a successful execution and attempt", async () => {
    const execution = await createExecution({ suffix: "success", maxRetries: 3 });

    await processExecution(database, workerId, execution.id, workspaceId, async () => ({
      outcome: "success",
      statusCode: 200,
      durationMs: 5,
      responseBodySample: "OK",
      errorMessage: null,
    }));

    const [updated, attempts] = await Promise.all([
      database.execution.findUniqueOrThrow({ where: { id: execution.id } }),
      database.executionAttempt.findMany({ where: { executionId: execution.id } }),
    ]);
    expect(updated.status).toBe("succeeded");
    expect(updated.attemptCount).toBe(1);
    expect(updated.terminalAt).not.toBeNull();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe("success");
    expect(attempts[0]?.httpStatusCode).toBe(200);
  });

  it("schedules a retry for a retryable server error", async () => {
    const execution = await createExecution({ suffix: "retry", maxRetries: 2 });

    await processExecution(database, workerId, execution.id, workspaceId, async () => ({
      outcome: "server_error",
      statusCode: 500,
      durationMs: 8,
      responseBodySample: "Internal Server Error",
      errorMessage: null,
    }));

    const [updated, attempts] = await Promise.all([
      database.execution.findUniqueOrThrow({ where: { id: execution.id } }),
      database.executionAttempt.findMany({ where: { executionId: execution.id } }),
    ]);
    expect(updated.status).toBe("pending");
    expect(updated.attemptCount).toBe(1);
    expect(updated.nextRetryAt).not.toBeNull();
    expect(updated.terminalAt).toBeNull();
    expect(attempts[0]?.outcome).toBe("server_error");
  });

  it("fails terminally after retry exhaustion", async () => {
    const execution = await createExecution({
      suffix: "exhausted",
      attemptCount: 1,
      maxRetries: 1,
    });

    await processExecution(database, workerId, execution.id, workspaceId, async () => ({
      outcome: "server_error",
      statusCode: 503,
      durationMs: 8,
      responseBodySample: "Service Unavailable",
      errorMessage: null,
    }));

    const [updated, attempts] = await Promise.all([
      database.execution.findUniqueOrThrow({ where: { id: execution.id } }),
      database.executionAttempt.findMany({ where: { executionId: execution.id } }),
    ]);
    expect(updated.status).toBe("failed");
    expect(updated.attemptCount).toBe(2);
    expect(updated.nextRetryAt).toBeNull();
    expect(updated.terminalAt).not.toBeNull();
    expect(attempts[0]?.attemptNumber).toBe(2);
  });

  it("rejects stale fencing generations and recovers expired leases", async () => {
    const execution = await createExecution({ suffix: "fence", maxRetries: 1 });
    const claimed = await claimExecution(database, execution.id, "worker-a", 60_000);
    expect(claimed).not.toBeNull();
    expect(await recordOutcome(database, execution.id, claimed!.leaseGeneration - 1, "succeeded")).toBe(false);

    await database.execution.update({ where: { id: execution.id }, data: { leaseExpiresAt: new Date(Date.now() - 1_000) } });
    await database.executionOutbox.update({ where: { executionId: execution.id }, data: { publishedAt: new Date() } });
    expect(await recoverStaleLease(database, execution.id)).toBe(true);
    const recovered = await database.execution.findUniqueOrThrow({ where: { id: execution.id } });
    const outbox = await database.executionOutbox.findUniqueOrThrow({ where: { executionId: execution.id } });
    expect(recovered.status).toBe("pending");
    expect(recovered.leaseGeneration).toBe(claimed!.leaseGeneration + 1);
    expect(outbox.publishedAt).toBeNull();
    expect(await claimExecution(database, execution.id, "worker-b", 60_000)).not.toBeNull();
  });

  it("tolerates duplicate queue deliveries with one fenced HTTP attempt", async () => {
    const execution = await createExecution({ suffix: "duplicate", maxRetries: 1 });
    const deliver = vi.fn().mockResolvedValue({ outcome: "success", statusCode: 204, durationMs: 2, responseBodySample: null, errorMessage: null });
    await Promise.all([
      processExecution(database, workerId, execution.id, workspaceId, deliver),
      processExecution(database, "other-worker", execution.id, workspaceId, deliver),
    ]);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(await database.executionAttempt.count({ where: { executionId: execution.id } })).toBe(1);
  });

  it("sends stable idempotency and HMAC signature headers", async () => {
    const execution = await createExecution({ suffix: "signature", maxRetries: 0 });
    const deliver = vi.fn(async (input: { headers: Record<string, string> }) => {
      expect(input.headers["X-Chronix-Idempotency-Key"]).toBe(execution.idempotencyKey);
      expect(input.headers["X-Chronix-Signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);
      return { outcome: "success" as const, statusCode: 204, durationMs: 2, responseBodySample: null, errorMessage: null };
    });
    await processExecution(database, workerId, execution.id, workspaceId, deliver);
    expect(deliver).toHaveBeenCalledOnce();
  });
});
