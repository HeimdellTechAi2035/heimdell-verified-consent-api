import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { config } from "./config";

// Phase A scaffold: proves the always-on VM deployment works end to end
// (HTTP health check + a live WebSocket connection) before any Twilio,
// Claude, or database wiring is added in later phases.

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (socket, req) => {
  console.log(`[voice-agent] ws connection opened: ${req.url}`);

  socket.on("message", (data) => {
    console.log(`[voice-agent] ws message received on ${req.url}: ${data.toString()}`);
    socket.send(data.toString());
  });

  socket.on("close", () => {
    console.log(`[voice-agent] ws connection closed: ${req.url}`);
  });
});

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

server.listen(config.port, () => {
  console.log(`[voice-agent] listening on port ${config.port}`);
});
