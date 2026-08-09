import "dotenv/config";
import { configSchema } from "./schema.js";
import type { Config } from "./schema.js";

function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    console.error("[Chronix] Invalid configuration — process cannot start.");
    console.error(JSON.stringify(result.error.flatten(), null, 2));
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
export { configSchema } from "./schema.js";
export type { Config } from "./schema.js";
