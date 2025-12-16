const { createLogger, format, transports } = require("winston");
const path = require("path");
require("winston-daily-rotate-file");

// Destructuring
const { combine, timestamp, printf, splat } = format;

// Log Directory
const BASE_LOG_DIR = "/home/backend/logs";

// Format
const customFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let log = `[${timestamp}] [${level.toUpperCase()}]: ${message}`;

  if (Object.keys(metadata).length) {
    log += ` ${JSON.stringify(metadata)}`;
  }
  return log;
});

const fileFormat = printf(({ timestamp, ...info }) => {
  return `[Timestamp: ${timestamp}] ${JSON.stringify(info)}`;
});

// Daily Rotate File
const dailyTransport = new transports.DailyRotateFile({
  filename: path.join(BASE_LOG_DIR, "alarm-monitoring-%DATE%.log"),

  datePattern: "YYYY-MM-DD",
  zippedArchive: false,

  // File Retention
  maxFiles: "60d",
  maxSize: "200m",
  level: "info",

  format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), fileFormat),
});

const logger = createLogger({
  level: "info",

  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    splat(),
    customFormat
  ),

  transports: [
    new transports.Console({
      format: combine(
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        splat(),
        customFormat
      ),
      level: "debug",
    }),

    dailyTransport,
  ],
});

module.exports = logger;
