import { Registry, collectDefaultMetrics } from "prom-client";
import pino from "pino";
import { config } from "../common/config/index.js";

const transport = config.NODE_ENV === "development" ? { target: "pino-pretty", options: { colorize: true } } : undefined;
export const logger = pino({
  level: config.LOG_LEVEL,
  ...(transport === undefined ? {} : { transport }),
  base: { service: "chronix", environment: config.NODE_ENV },
  redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie", "*.password", "*.password_hash", "*.token", "*.key_hash", "*.refresh_token", "*.api_key"],
});
export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export async function initOpenTelemetry(): Promise<void> {
  if (config.OTEL_EXPORTER_OTLP_ENDPOINT === undefined) { logger.debug("OpenTelemetry exporter is not configured."); return; }
  const [{ NodeSDK }, { OTLPTraceExporter }, { getNodeAutoInstrumentations }] = await Promise.all([import("@opentelemetry/sdk-node"), import("@opentelemetry/exporter-trace-otlp-grpc"), import("@opentelemetry/auto-instrumentations-node")]);
  const sdk = new NodeSDK({ traceExporter: new OTLPTraceExporter({ url: config.OTEL_EXPORTER_OTLP_ENDPOINT }), instrumentations: [getNodeAutoInstrumentations()] });
  sdk.start();
  logger.info("OpenTelemetry SDK started.");
}
