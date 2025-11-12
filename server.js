const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");

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

wss.on("connection", (ws) => {
  log(`Client connected! Total clients: ${wss.clients.size}`);

  //Heartbeat
  ws.isAlive = true;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  // Send current state to new connected client
  if (alarmState === "playing") {
    ws.send("play-alarm");
  }

  ws.on("message", (message) => {
    const msg = message.toString();
    log(`Message from client: ${msg}`);

    if (message.toString() === "ack-alarm") {
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
    log(`Client disconnected! Total clients left: ${wss.clients.size}`);

    // Reset state when last client disconnected
    if (wss.clients.size === 0) {
      log("--- All clients disconnected, resetting state to 'idle' ---");

      if (alarmState === "playing" || alarmState === "acknowledged") {
        alarmState = "idle";
      }
    }
  });
});

// Heartbeat Function
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Message Broadcast to Connected Client
function broadcast(data) {
  log(`Broadcasting message: ${data}`);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// --- LOGIKA WEBHOOK BARU (STATEFUL) ---
app.post("/alert", (req, res) => {
  const { status, alerts } = req.body;
  log(`\n--- WEBHOOK RECEIVED [${status}] ---`);

  if (!alerts) {
    logWarn("No 'alerts' array found in webhook body.");
    return res.send("OK (no alerts array)");
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
  log(`Current Set contents:`, Array.from(firingAlerts)); // DEBUG LOG
  log(`Alarm audio state: ${alarmState}`);
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
      log("State remains: PLAYING");
    }
  } else if (firingAlerts.size === 0) {
    if (alarmState === "playing" || alarmState === "acknowledged") {
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
});
