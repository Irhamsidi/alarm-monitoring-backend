const WebSocket = require("ws");
const crypto = require("crypto");
const logger = require("./logger");
const stateManager = require("./stateManager");

let wss;

// WebSocker Server Initialization
function init(port) {
  wss = new WebSocket.Server({ port });
  logger.info(`WebSocket Server running on port ${port}`);

  // Setup Heartbeat Interval
  setupHeartbeat();

  wss.on("connection", (ws) => {
    handleConnection(ws);
  });
}

function handleConnection(ws) {
  ws.id = crypto.randomUUID().split("-")[0];
  ws.isAlive = true;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  logger.info(
    `Client [${ws.id}] connected! Total clients: ${wss.clients.size}`
  );

  // State Synchronizer
  if (stateManager.getState() === "playing") {
    logger.info(
      `Client [${ws.id}] connecting during PLAYING state. Syncing....`
    );
    sendToClient(ws, "play-alarm");
  }

  // Client Message Handler
  ws.on("message", (message) => {
    try {
      const msg = message.toString();
      logger.info(`Message from client [${ws.id}]: ${msg}`);

      if (msg === "ack-alarm") {
        handleAck(ws);
      } else if (msg === "reset-all") {
        handleReset();
      }
    } catch (err) {
      logger.error(`Error handling message from [${ws.id}]`, {
        error: err.message,
      });
    }
  });

  ws.on("close", () => {
    logger.info(
      `Client [${ws.id}] disconnected! Clients left: ${wss.clients.size}`
    );
  });

  ws.on("error", (err) => {
    logger.warn(`Error on client [${ws.id}]: ${err.message}`);
  });
}

// Heartbeat Logic
function setupHeartbeat() {
  setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((ws) => {
      try {
        if (ws.isAlive === false) {
          logger.info(
            `Heartbeat: Client [${ws.id}] unresponsive. Terminating....`
          );
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      } catch (err) {
        logger.warn(`Heartbeat error: ${err.message}`);
      }
    });
  }, 30000);
}

// Broadcast Function
function broadcast(data) {
  if (!wss) return;
  logger.info(`Broadcasting: ${data}`);

  wss.clients.forEach((client) => {
    if (client.readyState == WebSocket.OPEN) {
      client.send(data, (err) => {
        if (err)
          logger.warn(`Broadcast failed to [${client.id}]: ${err.message}`);
      });
    }
  });
}

// Single Client Helper
function sendToClient(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(data, (err) => {
      if (err) logger.warn(`Send failed to [${ws.id}]: ${err.message}`);
    });
  }
}

// ACK Button Handler
function handleAck(ws) {
  logger.info("--- ALARM ACKNOWLEDGED BY CLIENT ---");
  if (stateManager.getState() === "playing") {
    stateManager.setState("acknowledged");
    broadcast("stop-alarm");
  }
  logger.info(
    `Current State: ${stateManager.getState()}, Active Alerts: ${stateManager.getAlertCount()}`
  );
}

// Reset Handler
function handleReset() {
  logger.info("--- Manual Reset Triggered ---");
  stateManager.clearAlerts();
  stateManager.setState("idle");
  broadcast("stop-alarm");
  logger.info("State Reset Complete.");
}

module.exports = {
  init,
  broadcast,
};
