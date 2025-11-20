const express = require("express");
const bodyParser = require("body-parser");
const logger = require("./logger");
const websocketService = require("./websocketService");
const webhookHandler = require("./webhookHandler");

const HTTP_PORT = 5001;
const WS_PORT = 5002;

const app = express();
app.use(bodyParser.json());

app.post("/alert", webhookHandler.handleAlert);

app.listen(HTTP_PORT, () => {
  logger.info(`Webhook HTTP Server running on port ${HTTP_PORT}`);
});

websocketService.init(WS_PORT);

logger.info("Server Initialized and Ready.");
