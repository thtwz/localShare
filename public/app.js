const elements = {
  hostname: document.querySelector("#hostname"),
  roleBadge: document.querySelector("#role-badge"),
  peerList: document.querySelector("#peer-list"),
  currentTarget: document.querySelector("#current-target"),
  fileTarget: document.querySelector("#file-target"),
  chatTarget: document.querySelector("#chat-target"),
  connectButton: document.querySelector("#connect-button"),
  disconnectButton: document.querySelector("#disconnect-button"),
  fileInput: document.querySelector("#file-input"),
  fileLabel: document.querySelector("#file-label"),
  sendButton: document.querySelector("#send-button"),
  cancelButton: document.querySelector("#cancel-button"),
  incomingPanel: document.querySelector("#incoming-panel"),
  incomingOverlay: document.querySelector("#incoming-overlay"),
  incomingText: document.querySelector("#incoming-text"),
  incomingOverlayText: document.querySelector("#incoming-overlay-text"),
  acceptButton: document.querySelector("#accept-button"),
  rejectButton: document.querySelector("#reject-button"),
  overlayAcceptButton: document.querySelector("#overlay-accept-button"),
  overlayRejectButton: document.querySelector("#overlay-reject-button"),
  chatLog: document.querySelector("#chat-log"),
  chatInput: document.querySelector("#chat-input"),
  chatSendButton: document.querySelector("#chat-send-button"),
  statusText: document.querySelector("#status-text"),
  progressBar: document.querySelector("#progress-bar"),
  progressText: document.querySelector("#progress-text")
};

const state = {
  clientLabel: "",
  peers: [],
  selectedPeer: null,
  activePeerLabel: null,
  incomingRequestFrom: null,
  selectedFile: null,
  ws: null,
  heartbeatTimer: null,
  peerConnection: null,
  dataChannel: null,
  incomingChunks: [],
  incomingBytes: 0,
  expectedBytes: 0,
  transferActive: false,
  messages: []
};

const chunkSize = 64 * 1024;

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function setStatus(text) {
  elements.statusText.textContent = text;
}

function setRole(role) {
  const labels = {
    idle: "空闲中",
    selecting: "已选目标",
    outgoing: "发起会话",
    incoming: "收到请求",
    connected: "会话中",
    sending: "发送中",
    receiving: "接收中"
  };
  elements.roleBadge.textContent = labels[role] || labels.idle;
}

function setProgress(current, total) {
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  elements.progressBar.style.width = `${percent}%`;
  elements.progressText.textContent = `${percent}%`;
}

function toggleIncoming(visible) {
  elements.incomingPanel.classList.toggle("hidden", !visible);
  elements.incomingOverlay.classList.toggle("hidden", !visible);
}

function appendChatMessage(author, text, kind) {
  state.messages.push({ author, text, kind });
  renderChat();
}

function createChatMessageNode(message) {
  const wrapper = document.createElement("div");
  wrapper.className = `chat-message ${message.kind}`;

  const author = document.createElement("span");
  author.className = "chat-author";
  author.textContent = message.author;

  const body = document.createElement("div");
  body.className = "chat-body";
  body.textContent = message.text;

  wrapper.append(author, body);
  return wrapper;
}

function renderChat() {
  if (state.messages.length === 0) {
    elements.chatLog.innerHTML = '<p class="empty-text">建立会话后，就可以在这里聊天。</p>';
    return;
  }

  elements.chatLog.replaceChildren(...state.messages.map(createChatMessageNode));
  elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
}

function renderPeerList() {
  if (state.peers.length === 0) {
    elements.peerList.innerHTML = '<p class="empty-text">暂无其他在线设备</p>';
  } else {
    elements.peerList.innerHTML = state.peers.map((peer) => {
      const classes = [
        "peer-chip",
        state.selectedPeer === peer.label ? "selected" : "",
        state.activePeerLabel === peer.label ? "connected" : ""
      ].filter(Boolean).join(" ");
      const peerState = state.activePeerLabel === peer.label
        ? "会话中"
        : state.selectedPeer === peer.label
          ? "已选择"
          : "在线";
      return `
        <button type="button" class="${classes}" data-peer-label="${peer.label}">
          <span class="peer-name">${peer.label}</span>
          <span class="peer-state">${peerState}</span>
        </button>
      `;
    }).join("");
  }

  elements.currentTarget.textContent = state.selectedPeer || "未选择";
  elements.fileTarget.textContent = state.selectedPeer || "未选择";
  elements.chatTarget.textContent = state.activePeerLabel || state.selectedPeer || "未连接";
  elements.connectButton.disabled = !state.selectedPeer || state.selectedPeer === state.activePeerLabel;
  elements.disconnectButton.disabled = !state.activePeerLabel;
  const sessionReady = Boolean(state.activePeerLabel) && state.selectedPeer === state.activePeerLabel && state.dataChannel?.readyState === "open";
  elements.sendButton.disabled = !sessionReady;
  elements.chatInput.disabled = !sessionReady;
  elements.chatSendButton.disabled = !sessionReady;

  elements.peerList.querySelectorAll("[data-peer-label]").forEach((button) => {
    button.addEventListener("click", () => selectPeer(button.dataset.peerLabel));
  });
}

function clearChatForCurrentSession() {
  state.messages = [];
  renderChat();
}

function selectPeer(label) {
  if (state.activePeerLabel && state.activePeerLabel !== label) {
    disconnectSession("已切换目标，当前会话已断开", { notifyPeer: true });
  }
  state.selectedPeer = label;
  setRole("selecting");
  renderPeerList();
}

function stopHeartbeat() {
  if (state.heartbeatTimer) {
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = null;
  }
}

function startHeartbeat() {
  stopHeartbeat();
  state.heartbeatTimer = setInterval(() => {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ type: "ping" }));
    }
  }, 20000);
}

async function initializeClientLabel() {
  const response = await fetch("/api/meta");
  const meta = await response.json();
  state.clientLabel = meta.clientLabel;
  elements.hostname.textContent = meta.clientLabel;
}

function sendWsMessage(type, target, payload = null) {
  if (state.ws?.readyState !== WebSocket.OPEN) {
    return;
  }
  state.ws.send(JSON.stringify({ type, target, payload }));
}

function connectSignal() {
  return new Promise((resolve) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    state.ws = ws;

    ws.addEventListener("open", () => {
      startHeartbeat();
      setStatus("已连接到信令服务，请先选择一台在线设备");
      setRole("idle");
      resolve();
    });

    ws.addEventListener("message", async (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "peer-list") {
        state.peers = message.payload.peers;
        if (state.selectedPeer && !state.peers.some((peer) => peer.label === state.selectedPeer)) {
          state.selectedPeer = null;
        }
        renderPeerList();
        return;
      }

      if (message.type === "session-request") {
        if (state.activePeerLabel && state.activePeerLabel !== message.from) {
          sendWsMessage("session-reject", message.from, { reason: "busy" });
          return;
        }
        state.incomingRequestFrom = message.from;
        state.selectedPeer = message.from;
        const requestText = `${message.from} 想建立会话，你们可以聊天并互发文件。`;
        elements.incomingText.textContent = requestText;
        elements.incomingOverlayText.textContent = requestText;
        toggleIncoming(true);
        setStatus("收到新的会话请求");
        setRole("incoming");
        renderPeerList();
        return;
      }

      if (message.type === "session-accept") {
        state.activePeerLabel = message.from;
        state.selectedPeer = message.from;
        setStatus(`对方 ${message.from} 已接受，正在建立连接`);
        setRole("outgoing");
        renderPeerList();
        await startOutgoingPeer();
        return;
      }

      if (message.type === "session-reject") {
        setStatus(`对方 ${message.from} 已拒绝会话`);
        toggleIncoming(false);
        state.incomingRequestFrom = null;
        if (state.activePeerLabel === message.from) {
          disconnectSession("会话被对方拒绝");
        }
        renderPeerList();
        return;
      }

      if (message.type === "session-close") {
        if (state.activePeerLabel === message.from) {
          disconnectSession(`对方 ${message.from} 已结束当前会话`);
        }
        return;
      }

      if (message.type === "signal") {
        if (!state.selectedPeer) {
          state.selectedPeer = message.from;
          renderPeerList();
        }
        await handleSignal(message.from, message.payload);
        return;
      }

      if (message.type === "peer-disconnected") {
        if (state.activePeerLabel === message.from || state.incomingRequestFrom === message.from) {
          disconnectSession(`设备 ${message.from} 已离线`);
        }
        return;
      }

      if (message.type === "pong") {
        return;
      }

      if (message.type === "error") {
        setStatus(message.payload.message);
      }
    });

    ws.addEventListener("close", () => {
      stopHeartbeat();
      if (state.transferActive) {
        setStatus("信令连接已断开，但当前文件传输会继续");
        return;
      }
      setStatus("信令连接已断开，请刷新页面重试");
      disconnectSession("信令连接已断开");
    });
  });
}

function disconnectSession(reason = "当前会话已断开", options = {}) {
  const { notifyPeer = false } = options;
  const peerToNotify = notifyPeer ? state.activePeerLabel : null;

  state.transferActive = false;
  if (state.dataChannel) {
    state.dataChannel.close();
  }
  if (state.peerConnection) {
    state.peerConnection.close();
  }
  state.peerConnection = null;
  state.dataChannel = null;
  state.activePeerLabel = null;
  state.incomingRequestFrom = null;
  state.incomingChunks = [];
  state.incomingBytes = 0;
  state.expectedBytes = 0;
  clearChatForCurrentSession();
  toggleIncoming(false);
  setProgress(0, 0);
  setStatus(reason);
  setRole(state.selectedPeer ? "selecting" : "idle");
  renderPeerList();

  if (peerToNotify) {
    sendWsMessage("session-close", peerToNotify);
  }
}

function sendSignal(payload) {
  if (!state.selectedPeer) {
    return;
  }
  sendWsMessage("signal", state.selectedPeer, payload);
}

async function createPeerConnection(isCaller) {
  if (state.peerConnection) {
    state.peerConnection.close();
  }

  const peerConnection = new RTCPeerConnection();
  state.peerConnection = peerConnection;

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignal({ candidate: event.candidate });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    if (peerConnection.connectionState === "connected") {
      state.activePeerLabel = state.selectedPeer;
      setRole("connected");
      setStatus(`已和 ${state.activePeerLabel} 建立会话`);
      renderPeerList();
    }

    if (peerConnection.connectionState === "failed" || peerConnection.connectionState === "disconnected" || peerConnection.connectionState === "closed") {
      disconnectSession("点对点会话已断开");
    }
  };

  if (isCaller) {
    const channel = peerConnection.createDataChannel("localshare-session");
    setupSessionChannel(channel);
  } else {
    peerConnection.ondatachannel = (event) => {
      setupSessionChannel(event.channel);
    };
  }

  return peerConnection;
}

function setupSessionChannel(channel) {
  state.dataChannel = channel;
  channel.binaryType = "arraybuffer";

  channel.addEventListener("open", () => {
    renderPeerList();
  });

  channel.addEventListener("close", () => {
    state.transferActive = false;
    renderPeerList();
  });

  channel.addEventListener("message", (event) => {
    if (typeof event.data === "string") {
      const message = JSON.parse(event.data);
      if (message.type === "chat") {
        appendChatMessage(message.payload.author, message.payload.text, "peer");
        return;
      }
      if (message.type === "file-meta") {
        state.expectedBytes = message.payload.fileSize;
        state.transferActive = true;
        setRole("receiving");
        setStatus(`正在接收 ${message.payload.fileName}`);
        return;
      }
      if (message.type === "file-complete") {
        finishIncomingFile(message.payload.fileName);
      }
      return;
    }

    state.incomingChunks.push(event.data);
    state.incomingBytes += event.data.byteLength;
    setProgress(state.incomingBytes, state.expectedBytes);
  });
}

async function startOutgoingPeer() {
  const peerConnection = await createPeerConnection(true);
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  sendSignal({ description: peerConnection.localDescription });
}

async function handleSignal(from, payload) {
  state.selectedPeer = from;
  state.activePeerLabel = from;
  renderPeerList();

  if (payload.description?.type === "offer") {
    if (!state.peerConnection) {
      await createPeerConnection(false);
    }
    await state.peerConnection.setRemoteDescription(payload.description);
    const answer = await state.peerConnection.createAnswer();
    await state.peerConnection.setLocalDescription(answer);
    sendSignal({ description: state.peerConnection.localDescription });
    return;
  }

  if (payload.description?.type === "answer" && state.peerConnection) {
    await state.peerConnection.setRemoteDescription(payload.description);
    return;
  }

  if (payload.candidate && state.peerConnection) {
    await state.peerConnection.addIceCandidate(payload.candidate);
  }
}

async function sendSelectedFile() {
  const file = state.selectedFile;
  if (!file || !state.dataChannel || state.dataChannel.readyState !== "open") {
    setStatus("请先和当前目标建立会话");
    return;
  }

  state.transferActive = true;
  setRole("sending");
  state.dataChannel.send(JSON.stringify({
    type: "file-meta",
    payload: {
      fileName: file.name,
      fileSize: file.size
    }
  }));

  let offset = 0;
  while (offset < file.size) {
    const chunk = await file.slice(offset, offset + chunkSize).arrayBuffer();
    state.dataChannel.send(chunk);
    offset += chunk.byteLength;
    setProgress(offset, file.size);

    while (state.dataChannel.bufferedAmount > chunkSize * 8) {
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }

  state.dataChannel.send(JSON.stringify({
    type: "file-complete",
    payload: {
      fileName: file.name
    }
  }));

  state.transferActive = false;
  setRole("connected");
  setStatus(`文件已发送给 ${state.activePeerLabel}`);
}

function finishIncomingFile(fileName) {
  const blob = new Blob(state.incomingChunks);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);

  state.transferActive = false;
  state.incomingChunks = [];
  state.incomingBytes = 0;
  setProgress(state.expectedBytes, state.expectedBytes);
  setRole("connected");
  setStatus(`文件 ${fileName} 已接收完成`);
}

function sendChatMessage() {
  const text = elements.chatInput.value.trim();
  if (!text) {
    return;
  }
  if (!state.dataChannel || state.dataChannel.readyState !== "open") {
    setStatus("请先和当前目标建立会话");
    return;
  }

  state.dataChannel.send(JSON.stringify({
    type: "chat",
    payload: {
      author: state.clientLabel,
      text
    }
  }));
  appendChatMessage(state.clientLabel, text, "self");
  elements.chatInput.value = "";
}

async function acceptIncomingRequest() {
  if (!state.incomingRequestFrom) {
    return;
  }

  state.selectedPeer = state.incomingRequestFrom;
  sendWsMessage("session-accept", state.incomingRequestFrom);
  toggleIncoming(false);
  setStatus(`已接受 ${state.incomingRequestFrom} 的会话请求，等待对方发起连接`);
  setRole("incoming");
  renderPeerList();
}

function rejectIncomingRequest() {
  if (!state.incomingRequestFrom) {
    return;
  }
  sendWsMessage("session-reject", state.incomingRequestFrom, { reason: "rejected" });
  toggleIncoming(false);
  setStatus(`已拒绝 ${state.incomingRequestFrom} 的会话请求`);
  state.incomingRequestFrom = null;
  setRole(state.selectedPeer ? "selecting" : "idle");
  renderPeerList();
}

elements.connectButton.addEventListener("click", () => {
  if (!state.selectedPeer) {
    return;
  }
  sendWsMessage("session-request", state.selectedPeer, { mode: "chat-and-file" });
  setStatus(`已向 ${state.selectedPeer} 发起会话请求`);
  setRole("outgoing");
});

elements.disconnectButton.addEventListener("click", () => {
  disconnectSession("你已主动断开当前会话", { notifyPeer: true });
});

elements.fileInput.addEventListener("change", () => {
  const [file] = elements.fileInput.files;
  state.selectedFile = file || null;
  elements.fileLabel.textContent = file ? `${file.name} · ${formatBytes(file.size)}` : "选择一个文件";
});

elements.sendButton.addEventListener("click", async () => {
  await sendSelectedFile();
});

elements.acceptButton.addEventListener("click", acceptIncomingRequest);
elements.overlayAcceptButton.addEventListener("click", acceptIncomingRequest);
elements.rejectButton.addEventListener("click", rejectIncomingRequest);
elements.overlayRejectButton.addEventListener("click", rejectIncomingRequest);
elements.chatSendButton.addEventListener("click", sendChatMessage);
elements.chatInput.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    sendChatMessage();
  }
});

await initializeClientLabel();
await connectSignal();
renderChat();
renderPeerList();
