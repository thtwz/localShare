# LocalShare Design

## Goal

Build a minimal LAN file-sharing page where two devices open the same `IP:port` URL, the sender selects one file, the receiver confirms acceptance, and the file transfers over WebRTC without extra features.

## Scope

- Single page application
- Single file per transfer
- Single active sender and single active receiver
- Computer name shown automatically from the host machine
- Lightweight local signaling over WebSocket
- Static page served behind local Nginx

## Out of Scope

- Accounts, rooms, or manual nicknames
- Multiple concurrent transfers
- Transfer history
- Resume/retry
- Drag and drop polish
- Authentication

## Architecture

- `server.js` serves static assets and hosts a WebSocket signaling server.
- `public/index.html`, `public/style.css`, and `public/app.js` implement the UI and WebRTC transfer flow.
- Nginx serves the page on a LAN port and proxies `/ws` to the local Node signaling server.

## User Flow

1. Two devices open the same LAN URL.
2. Sender chooses a file and clicks send.
3. Receiver sees the request with machine name, file name, and file size.
4. Receiver clicks accept.
5. Browser peers establish a WebRTC DataChannel.
6. Sender streams file chunks.
7. Receiver rebuilds the file and triggers download.

## Error Handling

- Show a clear message if no receiver is online.
- Show a clear message if receiver rejects.
- Show a clear message if WebRTC setup fails.
- Reset the page state after cancellation or disconnect.
