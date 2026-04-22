import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";

import { createAppServer } from "../server.js";

async function startServer() {
  const app = createAppServer();
  await app.listen(0);
  const address = app.server.address();
  return {
    app,
    httpBase: `http://127.0.0.1:${address.port}`,
    wsBase: `ws://127.0.0.1:${address.port}/ws`
  };
}

function collectMessages(socket) {
  const messages = [];
  socket.on("message", (raw) => {
    messages.push(JSON.parse(raw.toString()));
  });
  return messages;
}

async function waitFor(predicate, timeout = 200) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = predicate();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return undefined;
}

test("serves hostname metadata", async () => {
  const { app, httpBase } = await startServer();

  try {
    const port = new URL(httpBase).port;
    const response = await fetch(`${httpBase}/api/meta`, {
      headers: {
        "x-real-ip": "192.168.0.8"
      }
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");

    const body = await response.json();
    assert.deepEqual(body, { clientLabel: `192.168.0.8:${port}` });
  } finally {
    await app.close();
  }
});

test("serves the main page shell", async () => {
  const { app, httpBase } = await startServer();

  try {
    const response = await fetch(httpBase);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /LocalShare/);
    assert.match(body, /id="send-button"/);
    assert.match(body, /发送文件/);
    assert.match(body, /接收请求/);
    assert.match(body, /在线设备/);
    assert.match(body, /聊天通道/);
    assert.match(body, /src="\/app\.js"/);
  } finally {
    await app.close();
  }
});

test("broadcasts the online peer list excluding the current client", async () => {
  const { app, wsBase } = await startServer();
  const alpha = new WebSocket(wsBase, {
    headers: {
      host: "172.20.10.2:23305",
      "x-real-ip": "192.168.0.10"
    }
  });
  const receiver = new WebSocket(wsBase, {
    headers: {
      host: "172.20.10.2:23305",
      "x-real-ip": "192.168.0.11"
    }
  });

  try {
    const alphaMessages = collectMessages(alpha);
    const receiverMessages = collectMessages(receiver);
    await Promise.all([once(alpha, "open"), once(receiver, "open")]);

    const alphaPeerList = await waitFor(() => alphaMessages.find((message) => message.type === "peer-list" && message.payload.peers.length === 1));
    const receiverPeerList = await waitFor(() => receiverMessages.find((message) => message.type === "peer-list" && message.payload.peers.length === 1));

    assert.deepEqual(alphaPeerList.payload.peers, [{ label: "192.168.0.11:23305" }]);
    assert.deepEqual(receiverPeerList.payload.peers, [{ label: "192.168.0.10:23305" }]);
  } finally {
    alpha.close();
    receiver.close();
    await app.close();
  }
});

test("forwards a targeted session request to the selected peer", async () => {
  const { app, wsBase } = await startServer();
  const sender = new WebSocket(wsBase, {
    headers: {
      host: "172.20.10.2:23305",
      "x-real-ip": "192.168.0.10"
    }
  });
  const receiver = new WebSocket(wsBase, {
    headers: {
      host: "172.20.10.2:23305",
      "x-real-ip": "192.168.0.11"
    }
  });

  try {
    const receiverMessages = collectMessages(receiver);
    await Promise.all([once(sender, "open"), once(receiver, "open")]);
    sender.send(JSON.stringify({
      type: "session-request",
      target: "192.168.0.11:23305",
      payload: {
        note: "chat"
      }
    }));

    const message = await waitFor(() => receiverMessages.find((item) => item.type === "session-request"));

    assert.equal(message.type, "session-request");
    assert.equal(message.from, "192.168.0.10:23305");
    assert.deepEqual(message.payload, { note: "chat" });
  } finally {
    sender.close();
    receiver.close();
    await app.close();
  }
});

test("forwards a targeted session acceptance back to the requester", async () => {
  const { app, wsBase } = await startServer();
  const sender = new WebSocket(wsBase, {
    headers: {
      host: "172.20.10.2:23305",
      "x-real-ip": "192.168.0.10"
    }
  });
  const receiver = new WebSocket(wsBase, {
    headers: {
      host: "172.20.10.2:23305",
      "x-real-ip": "192.168.0.11"
    }
  });

  try {
    const receiverMessages = collectMessages(receiver);
    await Promise.all([once(sender, "open"), once(receiver, "open")]);
    const senderMessages = collectMessages(sender);

    sender.send(JSON.stringify({
      type: "session-request",
      target: "192.168.0.11:23305",
      payload: {
        note: "chat"
      }
    }));

    await waitFor(() => receiverMessages.find((message) => message.type === "session-request"));
    receiver.send(JSON.stringify({
      type: "session-accept",
      target: "192.168.0.10:23305"
    }));

    const acceptMessage = await waitFor(() => senderMessages.find((message) => message.type === "session-accept"));
    assert.ok(acceptMessage);
    assert.equal(acceptMessage.from, "192.168.0.11:23305");
  } finally {
    sender.close();
    receiver.close();
    await app.close();
  }
});

test("forwards a targeted session close back to the connected peer", async () => {
  const { app, wsBase } = await startServer();
  const sender = new WebSocket(wsBase, {
    headers: {
      host: "172.20.10.2:23305",
      "x-real-ip": "192.168.0.10"
    }
  });
  const receiver = new WebSocket(wsBase, {
    headers: {
      host: "172.20.10.2:23305",
      "x-real-ip": "192.168.0.11"
    }
  });

  try {
    const receiverMessages = collectMessages(receiver);
    await Promise.all([once(sender, "open"), once(receiver, "open")]);

    sender.send(JSON.stringify({
      type: "session-close",
      target: "192.168.0.11:23305"
    }));

    const closeMessage = await waitFor(() => receiverMessages.find((message) => message.type === "session-close"));
    assert.ok(closeMessage);
    assert.equal(closeMessage.from, "192.168.0.10:23305");
  } finally {
    sender.close();
    receiver.close();
    await app.close();
  }
});

test("forwards signaling payloads only to the selected peer", async () => {
  const { app, wsBase } = await startServer();
  const sender = new WebSocket(wsBase, {
    headers: {
      host: "172.20.10.2:23305",
      "x-real-ip": "192.168.0.10"
    }
  });
  const receiver = new WebSocket(wsBase, {
    headers: {
      host: "172.20.10.2:23305",
      "x-real-ip": "192.168.0.11"
    }
  });
  const other = new WebSocket(wsBase, {
    headers: {
      host: "172.20.10.2:23305",
      "x-real-ip": "192.168.0.12"
    }
  });

  try {
    const receiverMessages = collectMessages(receiver);
    const otherMessages = collectMessages(other);
    await Promise.all([once(sender, "open"), once(receiver, "open"), once(other, "open")]);

    sender.send(JSON.stringify({
      type: "signal",
      target: "192.168.0.11:23305",
      payload: {
        description: { type: "offer", sdp: "demo" }
      }
    }));

    const signalMessage = await waitFor(() => receiverMessages.find((message) => message.type === "signal"));
    assert.ok(signalMessage);
    assert.equal(signalMessage.from, "192.168.0.10:23305");
    assert.deepEqual(signalMessage.payload, {
      description: { type: "offer", sdp: "demo" }
    });
    assert.equal(otherMessages.find((message) => message.type === "signal"), undefined);
  } finally {
    sender.close();
    receiver.close();
    other.close();
    await app.close();
  }
});

test("responds to heartbeat ping messages", async () => {
  const { app, wsBase } = await startServer();
  const client = new WebSocket(wsBase);

  try {
    await once(client, "open");
    const pongMessage = once(client, "message");
    client.send(JSON.stringify({ type: "ping" }));

    const [raw] = await pongMessage;
    const message = JSON.parse(raw.toString());
    assert.equal(message.type, "pong");
  } finally {
    client.close();
    await app.close();
  }
});
