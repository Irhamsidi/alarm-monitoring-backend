const { error } = require("winston");
const logger = require("./logger");
const stateManager = require("./stateManager");
const websocketService = require("./websocketService");

const IGNORED_ALERT_NAMES = [
  "DatasourceError",
  "DatasourceNoData",
  "GrafanaHealthError",
];

function handleAlert(req, res) {
  try {
    // Raw Message Payload
    const payload = req.body;
    logger.info("RAW PAYLOAD OBJECT (req.body):", payload);

    const { status, alerts } = req.body;
    logger.info(`\n--- WEBHOOK RECEIVED [${status}] ---`);

    if (!alerts || !Array.isArray(alerts)) {
      logger.warn("Invalid payload: No 'alerts' array found.");
      return res.status(400).send("Missing alerts!");
    }

    let isEffectiveChange = false;

    // Update State
    if (status === "firing") {
      alerts.forEach((alert) => {
        const name = alert.label?.alertname;
        const fp = alert.fingerprint;

        if (IGNORED_ALERT_NAMES.includes(name)) {
          logger.info(` >>>> IGNORING ALERT: [${name}]`);
          return;
        }

        if (!stateManager.hasAlert(fp)) {
          isEffectiveChange = true;
        }

        logger.info(` + Adding: [${fp}] (${name})`);
        stateManager.addAlert(fp);
      });
    } else if (status === "resolved") {
      alerts.forEach((alert) => {
        const name = alert.label?.alertname;
        const fp = alert.fingerprint;

        if (IGNORED_ALERT_NAMES.includes(name)) return;

        logger.info(`  - Removing: [${fp}] (${name})`);
        if (stateManager.removeAlert(fp)) {
          logger.info(`    ...Success!`);
          isEffectiveChange = true;
        } else {
          logger.info(`    ...Not found (Already removed/ignored)`);
        }
      });
    }

    // Current Status
    logger.info(`--- CURRENT STATE ---`);
    logger.info(`Count: ${stateManager.getAlertCount()}`);
    logger.info(`State: ${stateManager.getState()}`);
    logger.info(`Change: ${isEffectiveChange}`);
    logger.info(`---------------------`);

    // Play/Stop Condition
    const currentCount = stateManager.getAlertCount();
    const currentState = stateManager.getState();

    if (currentCount > 0) {
      if (currentState === "idle") {
        logger.info("Action: IDLE -> PLAYING");
        stateManager.setState("playing");
        websocketService.broadcast("play-alarm");
      } else if (currentState === "acknowledged") {
        if (status === "firing" && isEffectiveChange) {
          logger.info("Action: ACK -> PLAYING (New Alert)");
          stateManager.setState("playing");
          websocketService.broadcast("play-alarm");
        } else {
          logger.info("Action: Remain ACKNOWLEDGED");
        }
      } else {
        logger.info("Action: Remain PLAYING (Sync Broadcast");
        websocketService.broadcast("play-alarm");
      }
    } else {
      if (currentState !== "idle") {
        logger.info("Action: PLAYING/ACK -> IDLE");
        stateManager.setState("idle");
        websocketService.broadcast("stop-alarm");
      } else {
        logger.info("Action: Remain IDLE");
      }
    }

    res.send("OK");
  } catch (err) {
    logger.error("!!! Webhook Logic Error !!!", {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).send("Internal Server Error");
  }
}

module.exports = { handleAlert };
