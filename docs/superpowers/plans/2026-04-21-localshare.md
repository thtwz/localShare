# LocalShare Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal LAN file-sharing page with one sender, one receiver, receiver confirmation, and WebRTC file transfer behind local Nginx.

**Architecture:** A small Node HTTP server serves static assets and accepts WebSocket signaling connections. The browser UI manages a tiny session state machine and transfers the chosen file over a WebRTC data channel after the receiver accepts.

**Tech Stack:** Node.js, `ws`, browser WebRTC APIs, plain HTML/CSS/JS, local Nginx

---

## Chunk 1: Server and Signaling

### Task 1: Create the server contract with tests

**Files:**
- Create: `package.json`
- Create: `tests/server.test.js`
- Create: `server.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

### Task 2: Add static serving and hostname metadata

**Files:**
- Modify: `server.js`
- Test: `tests/server.test.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

## Chunk 2: Browser UI and WebRTC

### Task 3: Render the minimal page state

**Files:**
- Create: `public/index.html`
- Create: `public/style.css`
- Create: `public/app.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

### Task 4: Implement request, accept, and transfer flow

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

## Chunk 3: Deployment

### Task 5: Configure Nginx reverse proxy

**Files:**
- Create: `/usr/local/etc/nginx/servers/localshare.conf`

- [ ] **Step 1: Add server block for static page and `/ws` proxy**
- [ ] **Step 2: Validate Nginx config**
- [ ] **Step 3: Reload Nginx**

### Task 6: Verify end-to-end locally

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Start Node server**
- [ ] **Step 2: Open the LAN URL**
- [ ] **Step 3: Verify HTTP health and WebSocket upgrade**
- [ ] **Step 4: Record the final access URL**
