import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { config } from "./config";
import { handleConversationRelayConnection } from "./conversation-relay/ws-handler";

// Last-resort safety net: this process handles multiple concurrent phone
// calls, each with its own independent per-connection closure state (no
// shared mutable state across calls) -- so an uncaught exception from one
// call's handler is not a reason to kill every other live call on the
// process. Node's default behaviour for both of these is to crash the
// process; logging and continuing is the deliberate tradeoff here.
process.on("uncaughtException", (err) => {
  console.error("[voice-agent] uncaughtException (process kept alive):", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[voice-agent] unhandledRejection (process kept alive):", reason);
});

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

// A socket-level 'error' with no listener crashes the whole Node process
// by default -- handleConversationRelayConnection attaches its own
// listener first thing, but this is a defense-in-depth backstop in case a
// socket ever errors before that (or in a code path that forgets to).
wss.on("error", (err) => {
  console.error("[voice-agent] WebSocketServer error:", err);
});

wss.on("connection", (socket, req) => {
  socket.on("error", (err) => {
    console.error("[voice-agent] socket error before connection handler attached:", err);
  });

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
