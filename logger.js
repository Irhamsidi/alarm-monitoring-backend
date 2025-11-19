const { createLogger, format, transports } = require("winston");
require("winston-daily-rotate-file");

// Destructuring
const { combine, timestamp, printf, splat, json } = format;

const customFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let log = `[${timestamp}] [${level.toUpperCase()}]: ${message}`;

  if (Object.keys(metadata).length) {
    log += ` ${JSON.stringify(metadata)}`;
  }
  return log;
});

// Daily Rotate File
const dailyRotateFileTransport = new transports.DailyRotateFile({
  filename: "alarm-monitoring-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "200m",
  maxFiles: "7d",
  level: "info",

  format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), json()),
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

    dailyRotateFileTransport,
  ],
});

module.exports = logger;
