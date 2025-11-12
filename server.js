const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");

// State Management
const firingAlerts = new Set();
let alarmState = "idle"; // 'idle' | 'playing' | 'acknowledged'

//HTTP Server
const app = express();
app.use(bodyParser.json());
const HTTP_PORT = 5001;

//WebSocker Server
const wss = new WebSocket.Server({ port: 5002 });

wss.on("connection", (ws) => {
  console.log(`Client connected! Total clients: ${wss.clients.size}`);

  // Send current state to new connected client
  if (alarmState === "playing") {
    ws.send("play-alarm");
  }

  ws.on("message", (message) => {
    const msg = message.toString();
    console.log(`Message from client: ${msg}`);

    if (message.toString() === "ack-alarm") {
      console.log("--- ALARM ACKNOWLEDGED BY CLIENT ---");

      if (alarmState === "playing") {
        alarmState = "acknowledged";
        broadcast("stop-alarm");
      }
      console.log(
        `Current state: ${alarmState}, Firing alerts: ${firingAlerts.size}`
      );
    } else if (msg === "reset-all") {
      //Panic Button for Development Purpose
      console.log("--- Manual Reset Triggered ---");
      firingAlerts.clear();
      alarmState = "idle";
      broadcast("stop-alarm");
      console.log("State and Alerts have been reset.");
    }
  });

  ws.on("close", () => {
    console.log(`Client disconnected! Total clients left: ${wss.clients.size}`);

    //Reset state when last client disconnected
    if (wss.clients.size === 0) {
      console.log(
        "--- All clients disconnected, resetting state to 'idle' ---"
      );

      if (alarmState === "playing" || alarmState === "acknowledged") {
        alarmState = "idle";
      }
    }
  });
});

//Message Broadcast to Connected Client
function broadcast(data) {
  console.log(`Broadcasting message: ${data}`);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// --- LOGIKA WEBHOOK BARU (STATEFUL) ---
app.post("/alert", (req, res) => {
  const { status, alerts } = req.body;
  console.log(`\n--- WEBHOOK RECEIVED [${status}] ---`);

  if (!alerts) {
    console.warn("No 'alerts' array found in webhook body.");
    return res.send("OK (no alerts array)");
  }

  //Update'firingAlerts' lists
  if (status === "firing") {
    alerts.forEach((alert) => {
      const fp = alert.fingerprint;
      console.log(`  + Adding fingerprint: [${fp}]`); // DEBUG LOG
      firingAlerts.add(fp);
    });
  } else if (status === "resolved") {
    alerts.forEach((alert) => {
      const fp = alert.fingerprint;
      console.log(`  - Attempting to delete fingerprint: [${fp}]`); // DEBUG LOG
      if (firingAlerts.has(fp)) {
        firingAlerts.delete(fp);
        console.log(`    ...Success!`);
      } else {
        console.log(`    ...FAILED! Fingerprint [${fp}] not found in Set.`); // DEBUG LOG
      }
    });
  }

  console.log(`--- CURRENT STATE ---`);
  console.log(`Total firing alerts: ${firingAlerts.size}`);
  console.log(`Current Set contents:`, Array.from(firingAlerts)); // DEBUG LOG
  console.log(`Alarm audio state: ${alarmState}`);
  console.log(`---------------------`);

  //Define new status
  if (firingAlerts.size > 0) {
    if (alarmState === "idle") {
      console.log("State changed: IDLE/ACK -> PLAYING");
      alarmState = "playing";
      broadcast("play-alarm");
    } else if (alarmState === "acknowledged") {
      console.log("State changed: ACK -> PLAYING (New/Re-Firing Alert)");
      alarmState = "playing";
      broadcast("play-alarm");
    } else {
      console.log("State remains: PLAYING");
    }
  } else if (firingAlerts.size === 0) {
    if (alarmState === "playing" || alarmState === "acknowledged") {
      console.log("State changed: PLAYING/ACK -> IDLE");
      alarmState = "idle";
      broadcast("stop-alarm");
    } else {
      console.log("State remains: IDLE");
    }
  }

  res.send("OK");
});

app.listen(HTTP_PORT, () => {
  console.log(`Webhook Server running on port ${HTTP_PORT}`);
  console.log(`WebSocket Server running on port 5002`);
});
