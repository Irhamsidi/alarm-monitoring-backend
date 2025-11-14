const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const crypto = require("crypto");

// State Management
const firingAlerts = new Set();
let alarmState = "idle"; // 'idle' | 'playing' | 'acknowledged'

// Logger Helper
const log = (...args) => {
  const timestamp = new Date().toLocaleString("sv");
  console.log(`[${timestamp}]`, ...args);
};

const logWarn = (...args) => {
  const timestamp = new Date().toLocaleString("sv");
  console.warn(`[${timestamp}] WARN: `, ...args);
};

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
      if (ws.isAlive === false) {
        log(
          `Heartbeat: Client [${ws.id}] failed to pong. Terminating connection...`
        );
        return ws.terminate();
      }

      ws.isAlive = false;
      ws.ping();
    } catch (err) {
      logWarn(`Heartbeat: Error pinging client ${ws.id}: ${err.message}`);
    }
  });
}, 30000);

wss.on("connection", (ws) => {
  // Unique ID for Client
  ws.id = crypto.randomUUID().split("-")[0];

  // Heartbeat Client Setup
  ws.isAlive = true;
  ws.on("pong", heartbeat);

  log(`Client [${ws.id}] connected! Total clients: ${wss.clients.size}`);

  // Send current state to new connected client
  if (alarmState === "playing") {
    try {
      log(
        `Client [${ws.id}] connecting while alarm is PLAYING. Sending play command`
      );
      ws.send("play-alarm");
    } catch (err) {
      logWarn(
        `onConnection: Error sending play-alarm to client [${ws.id}]: ${err.message}`
      );
    }
  }

  ws.on("message", (message) => {
    const msg = message.toString();
    log(`Message from client [${ws.id}]: ${msg}`);

    if (msg === "ack-alarm") {
      log("--- ALARM ACKNOWLEDGED BY CLIENT ---");

      if (alarmState === "playing") {
        alarmState = "acknowledged";
        broadcast("stop-alarm");
      }
      log(`Current state: ${alarmState}, Firing alerts: ${firingAlerts.size}`);
    } else if (msg === "reset-all") {
      // Panic Button for Development Purpose
      log("--- Manual Reset Triggered ---");
      firingAlerts.clear();
      alarmState = "idle";
      broadcast("stop-alarm");
      log("State and Alerts have been reset.");
    }
  });

  ws.on("close", () => {
    log(
      `Client [${ws.id}] disconnected! Total clients left: ${wss.clients.size}`
    );
  });

  ws.on("error", (err) => {
    logWarn(`Error on client [${ws.id}]: ${err.message}`);
  });
});

// Stop Ping Interval when Server is not up
wss.on("close", function close() {
  clearInterval(interval);
});

// Message Broadcast to Connected Client
function broadcast(data) {
  log(`Broadcasting message: ${data}`);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(data);
      } catch (err) {
        logWarn(
          `Broadcast: Error sending to client [${client.id}]: ${err.message}`
        );
      }
    }
  });
}

// --- Webhook Logic ---
app.post("/alert", (req, res) => {
  const { status, alerts } = req.body;
  log(`\n--- WEBHOOK RECEIVED [${status}] ---`);

  if (!alerts || !Array.isArray(alerts)) {
    logWarn("Invalid payload: No 'alerts' array found.");
    return res.status(400).send("Missing 'alerts' array");
  }

  // Update'firingAlerts' lists
  if (status === "firing") {
    alerts.forEach((alert) => {
      const fp = alert.fingerprint;
      log(`  + Adding fingerprint: [${fp}]`); // DEBUG LOG
      firingAlerts.add(fp);
    });
  } else if (status === "resolved") {
    alerts.forEach((alert) => {
      const fp = alert.fingerprint;
      log(`  - Attempting to delete fingerprint: [${fp}]`); // DEBUG LOG
      if (firingAlerts.has(fp)) {
        firingAlerts.delete(fp);
        log(`    ...Success!`);
      } else {
        log(`    ...FAILED! Fingerprint [${fp}] not found in Set.`); // DEBUG LOG
      }
    });
  }

  log(`--- CURRENT STATE ---`);
  log(`Total firing alerts: ${firingAlerts.size}`);
  log(`Active Fingerprints:`, Array.from(firingAlerts)); // DEBUG LOG
  log(`Audio State: ${alarmState}`);
  log(`---------------------`);

  // Define new status
  if (firingAlerts.size > 0) {
    if (alarmState === "idle") {
      log("State changed: IDLE/ACK -> PLAYING");
      alarmState = "playing";
      broadcast("play-alarm");
    } else if (alarmState === "acknowledged") {
      log("State changed: ACK -> PLAYING (New/Re-Firing Alert)");
      alarmState = "playing";
      broadcast("play-alarm");
    } else {
      log("State remains: PLAYING. Re-broadcasting to sync all clients.");
      broadcast("play-alarm");
    }
  } else if (firingAlerts.size === 0) {
    if (alarmState !== "idle") {
      log("State changed: PLAYING/ACK -> IDLE");
      alarmState = "idle";
      broadcast("stop-alarm");
    } else {
      log("State remains: IDLE");
    }
  }

  res.send("OK");
});

app.listen(HTTP_PORT, () => {
  log(`Webhook Server running on port ${HTTP_PORT}`);
  log(`WebSocket Server running on port 5002`);
  log(`Server Ready. Waiting for Grafana alerts...`);
});
