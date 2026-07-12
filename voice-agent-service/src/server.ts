import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { config } from "./config";
import { handleConversationRelayConnection } from "./conversation-relay/ws-handler";

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
  const token = (req.url ?? "").replace(/^\/call\//, "").split("?")[0];

  if (!token) {
    console.error(`[voice-agent] ws connection with no token, closing: ${req.url}`);
    socket.close();
    return;
  }

  console.log(`[voice-agent] ws connection opened for call token ${token.slice(0, 8)}...`);
  void handleConversationRelayConnection(socket, token).catch((err) => {
    console.error(`[voice-agent] unhandled error in connection handler:`, err);
    socket.close();
  });

  socket.on("close", () => {
    console.log(`[voice-agent] ws connection closed for call token ${token.slice(0, 8)}...`);
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
