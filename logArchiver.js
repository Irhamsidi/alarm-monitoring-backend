const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const archiver = require("archiver");
const logger = require("./logger");

const BASE_LOG_DIR = "/home/backend/logs";

function initArchiver() {
  logger.info(
    "Log Archiver Service started. Scheduled for 1st day of every month."
  );

  cron.schedule("30 0 1 * *", async () => {
    logger.info("Running Monthly Log Archiving Process...");
    await archiveLastMonthLogs();
  });
}

async function archiveLastMonthLogs() {
  try {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);

    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const targetPattern = `alarm-monitoring-${year}-${month}`;

    // Directory Destination
    const yearDir = path.join(BASE_LOG_DIR, year);
    const monthDir = path.join(yearDir, month);

    if (!fs.existsSync(yearDir)) fs.mkdirSync(yearDir);
    if (!fs.existsSync(monthDir)) fs.mkdirSync(monthDir);

    // Find Monthly Log File
    const files = fs.readdirSync(BASE_LOG_DIR);
    const fileToArchive = files.filter(
      (file) => file.startsWith(targetPattern) && file.endsWith(".log")
    );

    if (fileToArchive.length === 0) {
      logger.info(`No logs found for ${year}-${month} to archive.`);
      // Delete Empty Dir If Not Used
      if (fs.readdirSync(monthDir).length === 0) fs.rmdirSync(monthDir);
      if (fs.readdirSync(yearDir).length === 0) fs.rmdirSync(yearDir);
      return;
    }

    logger.info(
      `Found ${fileToArchive.length} files to archive for ${year}-${month}. Moving files...`
    );

    for (const file of fileToArchive) {
      const oldPath = path.join(BASE_LOG_DIR, file);
      const newPath = path.join(monthDir, file);
      fs.renameSync(oldPath, newPath);
    }

    // Zip Dir
    const zipPath = path.join(yearDir, `${month}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      logger.info(
        `Archiving complete: ${zipPath} (${archive.pointer()} total bytes).`
      );

      try {
        fs.rmSync(monthDir, { recursive: true, force: true });
        logger.info(`Cleaned up raw folder: ${monthDir}`);
      } catch (clearnupErr) {
        logger.warn(`Failed to cleanup raw folder: ${clearnupErr.message}`);
      }
    });

    archive.on("error", (err) => {
      throw err;
    });

    archive.pipe(output);
    archive.directory(monthDir, false);
    await archive.finalize();
  } catch (error) {
    logger.error("Error during log archiving: ", { error: error.message });
  }
}

module.exports = { initArchiver };
