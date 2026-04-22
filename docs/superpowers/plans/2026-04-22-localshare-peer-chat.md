# LocalShare Peer Chat Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an online device list, single-target session selection, and chat messaging to LocalShare while keeping one active peer connection at a time.

**Architecture:** The signaling server will maintain connected peers by label and broadcast a peer list to every client. The browser will let the user pick one peer, establish a single WebRTC session to that peer, and reuse the connection for file transfer plus text chat.

**Tech Stack:** Node.js, `ws`, browser WebRTC APIs, plain HTML/CSS/JS, local Nginx

---

## Chunk 1: Targeted Signaling

### Task 1: Add tests for peer list and targeted requests

**Files:**
- Modify: `tests/server.test.js`
- Modify: `server.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

## Chunk 2: Device List and Session UI

### Task 2: Render online peers and current target

**Files:**
- Modify: `public/index.html`
- Modify: `public/style.css`
- Modify: `public/app.js`

- [ ] **Step 1: Write the failing shell test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

### Task 3: Add chat messaging to the active peer session

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Extend session state and message handling**
- [ ] **Step 2: Send/receive chat messages over WebRTC**
- [ ] **Step 3: Verify file transfer still works with the shared connection**
