import pino from "pino";

/**
 * One structured logger for the whole app. Cloud Run reads stdout as JSON, so
 * the field names are mapped to what Cloud Logging expects (`severity`,
 * `message`) rather than pino's defaults.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "dayemon" },
  messageKey: "message",
  formatters: {
    level(label) {
      return { severity: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
