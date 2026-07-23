# Changelog

## 0.1.0

First public release.

- KNX/IP **UDP tunnelling** — heartbeat, send mutex, auto-reconnect.
- **KNX IP Secure** tunnelling over TCP — X25519 handshake + AES-128-CCM wrapper,
  with inbound **anti-replay** and **constant-time MAC verification**.
- **Gateway discovery** via `SEARCH_REQUEST`.
- **DPT codecs** for families 1–14, 16–20, 26, 28, 29, 232, 235, 251.
- **ETS `.knxproj`** parsing — including password-protected (encrypted) projects,
  plus ETS CSV export parsing.
- **BusMonitor** — bounded in-memory ring buffer + EventEmitter.
- Low-level exports: transports, `SecureSession`, frame/APCI primitives, secure
  crypto primitives.
