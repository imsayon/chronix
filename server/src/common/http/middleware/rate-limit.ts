import type { NextFunction, Request, Response } from "express";
import type { Redis } from "ioredis";
import { TooManyRequestsError } from "../../errors/http-errors.js";
import { newUUIDv7 } from "../../ids.js";

/**
 * Atomic Redis sliding-window rate limiter.
 *
 * Uses a Lua script so the read-check-write is a single atomic operation.
 * Key: `ratelimit:<tier>:<identifier>`
 * Score: current timestamp (ms)
 * Member: unique random ID per request
 */
const SLIDING_WINDOW_SCRIPT = `
local key     = KEYS[1]
local now     = tonumber(ARGV[1])
local window  = tonumber(ARGV[2])
local limit   = tonumber(ARGV[3])
local member  = ARGV[4]

-- Remove members outside the window
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)

if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local reset_in = tonumber(oldest[2]) + window - now
  return {0, math.ceil(reset_in / 1000)}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return {1, -1}
`;

export interface RateLimitOptions {
  redis: Redis;
  tier: string;    // logical name, e.g. "auth:login"
  windowMs: number;
  max: number;
  identifierFn?: (req: Request) => string; // defaults to IP
}

export function rateLimitMiddleware(opts: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (process.env["NODE_ENV"] === "test") {
      next();
      return;
    }

    const identifier = opts.identifierFn?.(req) ?? (req.ip ?? "unknown");
    const key = `ratelimit:${opts.tier}:${identifier}`;
    const now = Date.now();

    try {
      const result = await opts.redis.eval(
        SLIDING_WINDOW_SCRIPT,
        1,
        key,
        String(now),
        String(opts.windowMs),
        String(opts.max),
        newUUIDv7(),
      ) as [number, number];

      const [allowed, retryAfterSeconds] = result;

      if (allowed === 0) {
        res.setHeader("Retry-After", String(retryAfterSeconds));
        res.setHeader("X-RateLimit-Limit", String(opts.max));
        res.setHeader("X-RateLimit-Reset", String(Date.now() + retryAfterSeconds * 1000));
        next(new TooManyRequestsError());
        return;
      }

      res.setHeader("X-RateLimit-Limit", String(opts.max));
      next();
    } catch {
      // If Redis is down, fail open — don't block legitimate traffic
      next();
    }
  };
}

// ─── Pre-configured rate limit tiers ─────────────────────────────────────────

export function authLoginRateLimit(redis: Redis) {
  return rateLimitMiddleware({ redis, tier: "auth:login", windowMs: 15 * 60 * 1000, max: 10 });
}

export function authRegisterRateLimit(redis: Redis) {
  return rateLimitMiddleware({ redis, tier: "auth:register", windowMs: 60 * 60 * 1000, max: 5 });
}

export function authRefreshRateLimit(redis: Redis) {
  return rateLimitMiddleware({ redis, tier: "auth:refresh", windowMs: 60 * 1000, max: 30 });
}
