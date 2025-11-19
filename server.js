const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const crypto = require("crypto");

// logger.infoger
const logger = require("./logger");

const IGNORED_ALERT_NAMES = ["DatasourceError", "NoData", "GrafanaHealthError"];

// State Management
const firingAlerts = new Set();
let alarmState = "idle"; // 'idle' | 'playing' | 'acknowledged'

// HTTP Server
const app = express();
app.use(bodyParser.json());
const HTTP_PORT = 5001;

// WebSocker Server
const wss = new WebSocket.Server({ port: 5002 });

// Heartbeat Function
function heartbeat() {
  this.isAlive = true;
}

const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    try {
      if (ws.isAlive === false || ws.readyState !== WebSocket.OPEN) {
        if (ws.isAlive === false) {
          logger.info(
            `Heartbeat: Client [${ws.id}] failed to pong. Terminating connection...`
          );
        } else {
          logger.info(
            `Heartbeat: Client [${ws.id}] is ALIVE but NOT OPEN (State: ${ws.readyState}). Terminating 'zombie' connection...`
          );
        }
        return ws.terminate();
      }

      ws.isAlive = false;
      ws.ping();
    } catch (err) {
      logger.warn(`Heartbeat: Error pinging client ${ws.id}: ${err.message}`);
    }
  });
}, 30000);

wss.on("connection", (ws) => {
  // Unique ID for Client
  ws.id = crypto.randomUUID().split("-")[0];

  // Heartbeat Client Setup
  ws.isAlive = true;
  ws.on("pong", heartbeat);

  logger.info(
    `Client [${ws.id}] connected! Total clients: ${wss.clients.size}`
  );

  // Send current state to new connected client
  if (alarmState === "playing") {
    logger.info(
      `Client [${ws.id}] connecting while alarm is PLAYING. Sending play command`
    );

    if (ws.readyState === WebSocket.OPEN) {
      ws.send("play-alarm", (err) => {
        if (err) {
          logger.warn(
            `onConnection: Error sending play-alarm to client [${ws.id}]: ${err.message}`
          );
        }
      });
    } else {
      logger.warn(
        `onConnection: Client [${ws.id}] is NOT OPEN (State: ${ws.readyState}). Skipping send.`
      );
    }
  }

  ws.on("message", (message) => {
    try {
      const msg = message.toString();
      logger.info(`Message from client [${ws.id}]: ${msg}`);

      if (msg === "ack-alarm") {
        logger.info("--- ALARM ACKNOWLEDGED BY CLIENT ---");

        if (alarmState === "playing") {
          alarmState = "acknowledged";
          broadcast("stop-alarm");
        }
        logger.info(
          `Current state: ${alarmState}, Firing alerts: ${firingAlerts.size}`
        );
      } else if (msg === "reset-all") {
        // Panic Button for Development Purpose
        logger.info("--- Manual Reset Triggered ---");
        firingAlerts.clear();
        alarmState = "idle";
        broadcast("stop-alarm");
        logger.info("State and Alerts have been reset.");
      }
    } catch (err) {
      logger.error(`!!! Unhandled Error in 'ws.on("message")' !!!`, {
        clientId: ws.id,
        error: err,
        rawMessage: message.toString(),
      });
    }
  });

  ws.on("close", () => {
    logger.info(
      `Client [${ws.id}] disconnected! Total clients left: ${wss.clients.size}`
    );
  });

  ws.on("error", (err) => {
    logger.warn(`Error on client [${ws.id}]: ${err.message}`);
  });
});

// Stop Ping Interval when Server is not up
wss.on("close", function close() {
  clearInterval(interval);
});

// Message Broadcast to Connected Client
function broadcast(data) {
  logger.info(`Broadcasting message: ${data}`);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data, (err) => {
        if (err) {
          logger.warn(
            `Broadcast: Error sending to client [${client.id}]: ${err.message}`
          );
        }
      });
    }
  });
}

// --- Webhook logger.infoic ---
app.post("/alert", (req, res) => {
  try {
    // Debugging for Receiving Raw Payload from Grafana
    const payload = req.body;
    logger.info("RAW PAYLOAD OBJECT (req.body):", payload);

    const { status, alerts } = req.body;
    logger.info(`\n--- WEBHOOK RECEIVED [${status}] ---`);

    if (status !== "firing" && status !== "resolved") {
      logger.info(`  >> Status [${status}] ignored (No Firing/Resolved).`);
      return res.send("Ignored Status");
    }

    if (!alerts || !Array.isArray(alerts)) {
      logger.warn("Invalid payload: No 'alerts' array found.");
      return res.status(400).send("Missing 'alerts' array");
    }

    // Update'firingAlerts' lists
    if (status === "firing") {
      alerts.forEach((alert) => {
        const alertName = alert.labels?.alertname;
        const fp = alert.fingerprint;

        if (IGNORED_ALERT_NAMES.includes(alertName)) {
          logger.info(`  >> IGNORING ALERT: [${alertName}] (In Ignored List)`);
          return;
        }

        logger.info(`  + Adding fingerprint: [${fp}] (${alertName})`);
        firingAlerts.add(fp);
      });
    } else if (status === "resolved") {
      alerts.forEach((alert) => {
        const alertName = alert.labels?.alertname;
        const fp = alert.fingerprint;

        if (IGNORED_ALERT_NAMES.includes(alertName)) {
          logger.info(
            `  >> IGNORING RESOLVED: [${alertName}] (In Ignored List)`
          );
          return;
        }

        logger.info(
          `  - Attempting to delete fingerprint: [${fp}] (${alertName})`
        ); // DEBUG logger.info
        if (firingAlerts.has(fp)) {
          firingAlerts.delete(fp);
          logger.info(`    ...Success!`);
        } else {
          logger.info(`    ...FAILED! Fingerprint [${fp}] not found in Set.`); // DEBUG logger.info
        }
      });
    }

    logger.info(`--- CURRENT STATE ---`);
    logger.info(`Total firing alerts: ${firingAlerts.size}`);
    logger.info(`Active Fingerprints:`, Array.from(firingAlerts)); // DEBUG logger.info
    logger.info(`Audio State: ${alarmState}`);
    logger.info(`---------------------`);

    // Define new status
    if (firingAlerts.size > 0) {
      if (alarmState === "idle") {
        logger.info("State changed: IDLE/ACK -> PLAYING");
        alarmState = "playing";
        broadcast("play-alarm");
      } else if (alarmState === "acknowledged") {
        logger.info("State changed: ACK -> PLAYING (New/Re-Firing Alert)");
        alarmState = "playing";
        broadcast("play-alarm");
      } else {
        logger.info(
          "State remains: PLAYING. Re-broadcasting to sync all clients."
        );
        broadcast("play-alarm");
      }
    } else if (firingAlerts.size === 0) {
      if (alarmState !== "idle") {
        logger.info("State changed: PLAYING/ACK -> IDLE");
        alarmState = "idle";
        broadcast("stop-alarm");
      } else {
        logger.info("State remains: IDLE");
      }
    }

    res.send("OK");
  } catch (err) {
    logger.error(`!!! Unhandled Error in Webhook Logic !!!`, {
      error: err,
      receivedPayload: JSON.stringify(req.body),
    });
    res.status(500).send("Internal Server Error");
  }
});

app.listen(HTTP_PORT, () => {
  logger.info(`Webhook Server running on port ${HTTP_PORT}`);
  logger.info(`WebSocket Server running on port 5002`);
  logger.info(`Server Ready. Waiting for Grafana alerts...`);
  logger.info(`Ignored Alerts List: ${JSON.stringify(IGNORED_ALERT_NAMES)}`);
});
