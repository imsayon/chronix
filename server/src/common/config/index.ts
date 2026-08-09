import "dotenv/config";
import { configSchema } from "./schema.js";
import type { Config } from "./schema.js";

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(environment);
  if (!result.success) {
    throw new Error(
      `Invalid Chronix configuration: ${JSON.stringify(result.error.flatten())}`,
    );
  }
  return result.data;
}

export { configSchema } from "./schema.js";
export type { Config } from "./schema.js";
