import { CronExpressionParser } from "cron-parser";
import { DateTime } from "luxon";
import { sha256Hex } from "../../common/crypto.js";

export type ScheduleInput = {
  scheduleType: "cron" | "one_time";
  cronExpression?: string | null;
  timezone: string;
};

/**
 * Computes the next occurrence of a schedule from a given date.
 * Handles DST spring-forward gaps correctly.
 */
export function computeNextOccurrence(input: ScheduleInput, fromDate: Date): Date | null {
  if (input.scheduleType === "one_time") {
    return null;
  }

  // Iterate until we find an occurrence that is not in a DST gap
  if (!input.cronExpression) {
    throw new Error('cronExpression is required for cron schedule type')
  }
  const parser = CronExpressionParser.parse(input.cronExpression, {
    currentDate: fromDate,
    tz: input.timezone,
  });

  for (let i = 0; i < 1000; i++) {
    let candidate: Date;
    try {
      candidate = parser.next().toDate();
    } catch {
      return null; // Expression has no future occurrences
    }

    // Verify the candidate is not in a DST gap
    const localDt = DateTime.fromJSDate(candidate, { zone: "utc" }).setZone(input.timezone);
    if (localDt.isValid) {
      return candidate;
    }
  }

  throw new Error(`computeNextOccurrence: could not find a valid occurrence within 1000 iterations for expression "${input.cronExpression}"`);
}

export type MisfirePolicy = "coalesce" | "skip" | "catch_up";

export type ScheduleState = {
  scheduleType: "cron" | "one_time";
  cronExpression?: string | null;
  timezone: string;
  misfirePolicy: MisfirePolicy;
  nextRunAt: Date;
};

export type MisfireResult = {
  /** The timestamp that this execution logically represents. */
  nominalRunAt: Date;
  /** When the schedule should run next. Null if completed. */
  nextRunAt: Date | null;
  /** Array of timestamps to execute for catch-up policy. Null for skip. */
  catchUpOccurrences?: Date[];
};

export function applyMisfirePolicy(schedule: ScheduleState, now: Date): MisfireResult {
  if (schedule.scheduleType === "one_time") {
    return {
      nominalRunAt: schedule.nextRunAt,
      nextRunAt: null,
    };
  }

  switch (schedule.misfirePolicy) {
    case "skip":
      return {
        nominalRunAt: null as unknown as Date, // No execution
        nextRunAt: computeNextOccurrence(schedule, now),
      };

    case "coalesce":
      return {
        nominalRunAt: schedule.nextRunAt, // The first missed occurrence
        nextRunAt: computeNextOccurrence(schedule, now),
      };

    case "catch_up": {
      const catchUpLimit = 10;
      const missedDates: Date[] = [];
      let curr = schedule.nextRunAt;

      while (curr.getTime() <= now.getTime() && missedDates.length < catchUpLimit) {
        missedDates.push(curr);
        const next = computeNextOccurrence(schedule, curr);
        if (!next || next.getTime() === curr.getTime()) break;
        curr = next;
      }

      return {
        nominalRunAt: missedDates[0] as Date, // For compatibility, though we return array
        catchUpOccurrences: missedDates,
        nextRunAt: computeNextOccurrence(schedule, missedDates[missedDates.length - 1] ?? now),
      };
    }
  }
}

export function deriveIdempotencyKey(scheduleId: string, nominalRunAt: Date): string {
  const hash = sha256Hex(scheduleId + ":" + nominalRunAt.toISOString());
  return hash.slice(0, 64);
}

export function computeBackoff(attemptCount: number, baseMs: number): number {
  if (attemptCount <= 0) return 0;
  // min(baseMs * 2^(attemptCount-1), 24 * 60 * 60 * 1000)
  const maxBackoff = 24 * 60 * 60 * 1000;
  const backoff = baseMs * Math.pow(2, attemptCount - 1);
  return Math.min(backoff, maxBackoff);
}
