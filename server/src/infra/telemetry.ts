import { Registry, collectDefaultMetrics } from "prom-client";
import pino from "pino";

const environment = process.env["NODE_ENV"] ?? "development";
const logLevel = process.env["LOG_LEVEL"] ?? "info";
const transport = environment === "development"
  ? { target: "pino-pretty", options: { colorize: true } }
  : undefined;

export const logger = pino({
  level: logLevel,
  ...(transport === undefined ? {} : { transport }),
  base: { service: "chronix", environment },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "*.password",
      "*.passwordHash",
      "*.password_hash",
      "*.token",
      "*.keyHash",
      "*.key_hash",
      "*.refreshToken",
      "*.refresh_token",
      "*.apiKey",
      "*.api_key",
    ],
    censor: "[REDACTED]",
  },
});

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

let telemetrySdk: { shutdown(): Promise<void> } | undefined;

export async function initOpenTelemetry(endpoint?: string): Promise<void> {
  if (endpoint === undefined) {
    logger.debug("OpenTelemetry exporter is not configured.");
    return;
  }
  const [{ NodeSDK }, { OTLPTraceExporter }, { getNodeAutoInstrumentations }] =
    await Promise.all([
      import("@opentelemetry/sdk-node"),
      import("@opentelemetry/exporter-trace-otlp-grpc"),
      import("@opentelemetry/auto-instrumentations-node"),
    ]);
  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();
  telemetrySdk = sdk;
  logger.info("OpenTelemetry SDK started.");
}

export async function shutdownOpenTelemetry(): Promise<void> {
  await telemetrySdk?.shutdown();
  telemetrySdk = undefined;
}
