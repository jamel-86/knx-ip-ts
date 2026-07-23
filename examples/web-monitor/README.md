# web-monitor — example React + Node app using `@jamel-knx/knx-ts`

A small reference app that demonstrates the library end-to-end:

- **Upload a `.knxproj`** (optionally password-protected) and use the parsed
  group-address map to decode telegrams.
- **Add / remove KNX interfaces** (classic UDP or KNX IP Secure over TCP).
- **Live group monitor** — every telegram on every connected interface
  streamed to the browser over a WebSocket and decoded with the registered
  DPT codecs.

The library is Node-only (it uses `node:dgram`/`node:net`), so this example
is split in two:

```
backend/   Express + ws — owns the TunnelClient instances and the ETS map.
frontend/  Vite + React + TypeScript — talks to the backend over REST + WS.
```

The backend imports the library directly from `../../src/index.ts` using
`tsx`, so you don't need to build the library first.

## Run

In two terminals (from this directory):

```bash
# terminal 1 — backend on http://localhost:8787
cd backend
npm install
npm run dev

# terminal 2 — frontend on http://localhost:5173 (proxies /api and /ws to :8787)
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>.

## Flow

1. Upload your `.knxproj` (password is optional). The backend parses it with
   `ETSProjectMap` and keeps it in memory; decoded telegrams use the GA names
   and DPTs from this map.
2. Add a KNX interface — gateway IP, port (default 3671), optionally a
   Secure user-id + user-password + device-auth-password. The backend opens a
   `TunnelClient` and pushes state changes to the browser.
3. Watch the group monitor. Every `L_DATA.ind` cEMI frame on any connected
   tunnel becomes a row with timestamp, source IA, destination GA, GA name
   (if known), APCI kind, decoded value + unit (if a DPT codec covers it),
   and the raw APDU hex.

## What this example deliberately does **not** do

- No persistence — restart the backend and you lose interfaces + the ETS map.
- No auth on the backend. Don't expose `:8787` to anything but localhost.
- No write UI yet. The WebSocket is bidirectional and the backend has the
  primitives (`TunnelClient.groupValueWrite`), so adding a "send" panel is
  a small extension.
