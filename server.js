import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");

function contentTypeFor(filePath) {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (filePath.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }
  return "application/octet-stream";
}

function getClientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = request.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }

  const remoteAddress = request.socket.remoteAddress || "";
  return remoteAddress.replace(/^::ffff:/, "");
}

function getClientLabel(request) {
  const ip = getClientIp(request);
  const host = request.headers.host || "";
  const port = host.includes(":") ? host.split(":").pop() : "";
  return port ? `${ip}:${port}` : ip;
}

function createSessionManager() {
  const sockets = new Set();

  const sendJson = (socket, message) => {
    if (socket && socket.readyState === 1) {
      socket.send(JSON.stringify(message));
    }
  };

  const broadcastPeerLists = () => {
    for (const socket of sockets) {
      const peers = [...new Set(
        [...sockets]
          .filter((peer) => peer !== socket && peer.clientLabel)
          .map((peer) => peer.clientLabel)
      )].map((label) => ({ label }));
      sendJson(socket, { type: "peer-list", payload: { peers } });
    }
  };

  const findSocketByLabel = (label) => {
    for (const socket of [...sockets].reverse()) {
      if (socket.clientLabel === label) {
        return socket;
      }
    }
    return null;
  };

  const handleMessage = (socket, raw) => {
    const message = JSON.parse(raw.toString());

    if (message.type === "ping") {
      sendJson(socket, { type: "pong" });
      return;
    }

    if (
      message.type === "session-request"
      || message.type === "session-accept"
      || message.type === "session-reject"
      || message.type === "session-close"
      || message.type === "signal"
    ) {
      const target = findSocketByLabel(message.target);
      if (!target) {
        sendJson(socket, {
          type: "error",
          payload: { message: `Target peer ${message.target} is offline.` }
        });
        return;
      }

      sendJson(target, {
        type: message.type,
        from: socket.clientLabel,
        payload: message.payload ?? null
      });
      return;
    }
  };

  return {
    addSocket(socket) {
      sockets.add(socket);
      broadcastPeerLists();
    },
    handleMessage(socket, raw) {
      handleMessage(socket, raw);
    },
    removeSocket(socket) {
      sockets.delete(socket);
      for (const peer of sockets) {
        sendJson(peer, { type: "peer-disconnected", from: socket.clientLabel });
      }
      broadcastPeerLists();
    }
  };
}

async function serveFile(response, filePath) {
  const buffer = await readFile(filePath);
  response.writeHead(200, { "content-type": contentTypeFor(filePath) });
  response.end(buffer);
}

export function createAppServer() {
  const sessionManager = createSessionManager();

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (url.pathname === "/api/meta") {
        const clientLabel = getClientLabel(request);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ clientLabel }));
        return;
      }

      let filePath = path.join(publicDir, url.pathname === "/" ? "index.html" : url.pathname.slice(1));
      if (!filePath.startsWith(publicDir)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      await serveFile(response, filePath);
    } catch (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error.code === "ENOENT" ? "Not Found" : "Server Error");
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.clientLabel = getClientLabel(request);
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (socket) => {
    sessionManager.addSocket(socket);

    socket.on("message", (raw) => {
      sessionManager.handleMessage(socket, raw);
    });

    socket.on("close", () => {
      sessionManager.removeSocket(socket);
    });
  });

  return {
    server,
    listen(port = 3001) {
      return new Promise((resolve) => {
        server.listen(port, "127.0.0.1", resolve);
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        for (const client of wss.clients) {
          client.terminate();
        }
        wss.close((wssError) => {
          server.close((serverError) => {
            if (wssError || serverError) {
              reject(wssError || serverError);
              return;
            }
            resolve();
          });
        });
      });
    }
  };
}

if (process.argv[1] === __filename) {
  const port = Number(process.env.PORT || 3001);
  const app = createAppServer();
  app.listen(port).then(() => {
    console.log(`LocalShare signaling server listening on http://127.0.0.1:${port}`);
  });
}
