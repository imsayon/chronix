import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DateTime } from "luxon";
import {
  computeNextOccurrence,
  applyMisfirePolicy,
  deriveIdempotencyKey,
  computeBackoff,
  ScheduleState
} from "./schedule.semantics.js";

describe("Scheduling Semantics", () => {
  describe("computeNextOccurrence", () => {
    it("returns null for one_time schedules", () => {
      const result = computeNextOccurrence(
        { scheduleType: "one_time", timezone: "UTC" },
        new Date()
      );
      expect(result).toBeNull();
    });

    it("computes standard next occurrence correctly", () => {
      // 0 12 * * * (noon every day)
      const input = { scheduleType: "cron" as const, cronExpression: "0 12 * * *", timezone: "UTC" };
      const from = new Date("2026-07-30T10:00:00Z");
      const next = computeNextOccurrence(input, from);
      expect(next?.toISOString()).toBe("2026-07-30T12:00:00.000Z");
    });

    it("handles DST spring-forward gap (skips non-existent time)", () => {
      // America/New_York spring forward: 2024-03-10 02:00 -> 03:00
      // 30 2 * * * (2:30 AM every day)
      const input = { scheduleType: "cron" as const, cronExpression: "30 2 * * *", timezone: "America/New_York" };
      // Start just before the gap
      const from = new Date("2024-03-09T00:00:00Z"); // Day before
      const next1 = computeNextOccurrence(input, from);
      expect(next1?.toISOString()).toBe("2024-03-09T07:30:00.000Z"); // 02:30 EST

      const next2 = computeNextOccurrence(input, next1!);
      // cron-parser natively shifts invalid times in the gap forward by 1 hour.
      // So 02:30 EST -> 03:30 EDT (07:30 UTC)
      expect(next2?.toISOString()).toBe("2024-03-10T07:30:00.000Z");
    });

    it("handles DST fall-back overlap (fires on first occurrence)", () => {
      // America/New_York fall back: 2024-11-03 01:00 -> 02:00, then repeats 01:00 -> 02:00
      // 30 1 * * * (1:30 AM every day)
      const input = { scheduleType: "cron" as const, cronExpression: "30 1 * * *", timezone: "America/New_York" };

      // The day before
      const from = new Date("2024-11-02T00:00:00Z");
      const next1 = computeNextOccurrence(input, from);
      expect(next1?.toISOString()).toBe("2024-11-02T05:30:00.000Z"); // 01:30 EDT

      const next2 = computeNextOccurrence(input, next1!);
      // cron-parser natively fires only ONCE on fall-back (at the first occurrence)
      expect(next2?.toISOString()).toBe("2024-11-03T05:30:00.000Z"); // 01:30 EDT

      const next3 = computeNextOccurrence(input, next2!);
      // Next occurrence is on the next day
      expect(next3?.toISOString()).toBe("2024-11-04T06:30:00.000Z"); // 01:30 EST
    });

    it("handles end of month boundary edge cases", () => {
      // Run on the 31st of every month at midnight
      const input = { scheduleType: "cron" as const, cronExpression: "0 0 31 * *", timezone: "UTC" };
      const from = new Date("2026-01-01T00:00:00Z");
      const next1 = computeNextOccurrence(input, from);
      expect(next1?.toISOString()).toBe("2026-01-31T00:00:00.000Z");

      const next2 = computeNextOccurrence(input, next1!);
      // Feb, Apr, Jun, Sep, Nov have < 31 days. Next 31st is March
      expect(next2?.toISOString()).toBe("2026-03-31T00:00:00.000Z");
    });
  });

  describe("applyMisfirePolicy", () => {
    it("returns correctly for one_time schedules", () => {
      const schedule: ScheduleState = {
        scheduleType: "one_time",
        timezone: "UTC",
        misfirePolicy: "coalesce",
        nextRunAt: new Date("2026-07-30T10:00:00Z")
      };
      const res = applyMisfirePolicy(schedule, new Date("2026-07-30T12:00:00Z"));
      expect(res.nominalRunAt.toISOString()).toBe("2026-07-30T10:00:00.000Z");
      expect(res.nextRunAt).toBeNull();
    });

    it("coalesce: runs once immediately and sets next run correctly", () => {
      // every hour, missed by 3 hours
      const schedule: ScheduleState = {
        scheduleType: "cron",
        cronExpression: "0 * * * *",
        timezone: "UTC",
        misfirePolicy: "coalesce",
        nextRunAt: new Date("2026-07-30T09:00:00Z")
      };
      const now = new Date("2026-07-30T12:15:00Z");
      const res = applyMisfirePolicy(schedule, now);

      expect(res.nominalRunAt?.toISOString()).toBe("2026-07-30T09:00:00.000Z"); // First missed
      expect(res.nextRunAt?.toISOString()).toBe("2026-07-30T13:00:00.000Z"); // Next from now
    });

    it("skip: does not run, only advances next run", () => {
      const schedule: ScheduleState = {
        scheduleType: "cron",
        cronExpression: "0 * * * *",
        timezone: "UTC",
        misfirePolicy: "skip",
        nextRunAt: new Date("2026-07-30T09:00:00Z")
      };
      const now = new Date("2026-07-30T12:15:00Z");
      const res = applyMisfirePolicy(schedule, now);

      expect(res.nominalRunAt).toBeNull();
      expect(res.nextRunAt?.toISOString()).toBe("2026-07-30T13:00:00.000Z");
    });

    it("catch_up: returns all missed dates up to the limit (10)", () => {
      // every hour, missed by 3 hours (9:00, 10:00, 11:00, 12:00)
      const schedule: ScheduleState = {
        scheduleType: "cron",
        cronExpression: "0 * * * *",
        timezone: "UTC",
        misfirePolicy: "catch_up",
        nextRunAt: new Date("2026-07-30T09:00:00Z")
      };
      const now = new Date("2026-07-30T12:15:00Z");
      const res = applyMisfirePolicy(schedule, now);

      expect(res.nominalRunAt?.toISOString()).toBe("2026-07-30T09:00:00.000Z");
      expect(res.catchUpOccurrences).toBeDefined();
      expect(res.catchUpOccurrences?.map(d => d.toISOString())).toEqual([
        "2026-07-30T09:00:00.000Z",
        "2026-07-30T10:00:00.000Z",
        "2026-07-30T11:00:00.000Z",
        "2026-07-30T12:00:00.000Z"
      ]);
      expect(res.nextRunAt?.toISOString()).toBe("2026-07-30T13:00:00.000Z");
    });

    it("catch_up: respects the limit of 10", () => {
      // every hour, missed by 24 hours
      const schedule: ScheduleState = {
        scheduleType: "cron",
        cronExpression: "0 * * * *",
        timezone: "UTC",
        misfirePolicy: "catch_up",
        nextRunAt: new Date("2026-07-29T12:00:00Z")
      };
      const now = new Date("2026-07-30T12:15:00Z");
      const res = applyMisfirePolicy(schedule, now);

      expect(res.catchUpOccurrences?.length).toBe(10);
      // nextRunAt should be computed from the last returned item!
      // In our code: computeNextOccurrence(schedule, missedDates[missedDates.length - 1] ?? now)
      expect(res.nextRunAt?.toISOString()).toBe("2026-07-29T22:00:00.000Z");
    });
  });

  describe("deriveIdempotencyKey", () => {
    it("is deterministic", () => {
      const k1 = deriveIdempotencyKey("test-id", new Date("2026-07-30T10:00:00Z"));
      const k2 = deriveIdempotencyKey("test-id", new Date("2026-07-30T10:00:00Z"));
      expect(k1).toBe(k2);
      expect(k1.length).toBe(64);
    });

    it("is different for different nominal run times", () => {
      const k1 = deriveIdempotencyKey("test-id", new Date("2026-07-30T10:00:00Z"));
      const k2 = deriveIdempotencyKey("test-id", new Date("2026-07-30T11:00:00Z"));
      expect(k1).not.toBe(k2);
    });
  });

  describe("computeBackoff", () => {
    it("caps at 24 hours", () => {
      const baseMs = 60000;
      expect(computeBackoff(1, baseMs)).toBe(60000);
      expect(computeBackoff(2, baseMs)).toBe(120000);
      expect(computeBackoff(3, baseMs)).toBe(240000);
      // At attempt 12, backoff is ~34 hours without cap
      const capped = computeBackoff(12, baseMs);
      expect(capped).toBe(24 * 60 * 60 * 1000);
    });
  });
});
