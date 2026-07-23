# knx-ip-ts

[![npm version](https://img.shields.io/npm/v/knx-ip-ts.svg)](https://www.npmjs.com/package/knx-ip-ts)
[![license](https://img.shields.io/npm/l/knx-ip-ts.svg)](./LICENSE)
[![types](https://img.shields.io/npm/types/knx-ip-ts.svg)](https://www.npmjs.com/package/knx-ip-ts)
[![node](https://img.shields.io/node/v/knx-ip-ts.svg)](https://www.npmjs.com/package/knx-ip-ts)

A pure-TypeScript KNX/IP client library for Node.js. KNXnet/IP tunnelling,
KNX IP Secure, gateway discovery, DPT codecs, and ETS `.knxproj` parsing —
strict types, no native dependencies, library-first (export the low-level
frame and crypto primitives or just call the high-level client).

## Features & scope

| Capability | Status |
| --- | --- |
| KNX/IP **tunnelling over UDP** (heartbeat, send mutex, auto-reconnect) | ✅ |
| **KNX IP Secure** tunnelling over TCP (X25519 handshake + AES-128-CCM wrapper) | ✅ |
| **Gateway discovery** via `SEARCH_REQUEST` | ✅ |
| **DPT codecs** (1–14, 16–20, 26, 28, 29, 232, 235, 251) | ✅ |
| **ETS `.knxproj`** parsing — including password-protected projects | ✅ |
| KNX/IP **routing** (multicast) | — |
| **KNX Data Secure** (group-level encryption) | — |
| **TP / FT1.2** serial transceiver | — |

Focused on purpose: a correct, auditable KNX/IP client + project parser. No
half-implemented surfaces.

## Install

```bash
npm install knx-ip-ts
```

Requires Node.js ≥ 18.

## Quick start

The common path: open a tunnel, react to incoming cEMI frames, send a
GroupValueWrite.

```ts
import { TunnelClient, smallValue } from 'knx-ip-ts';

const client = new TunnelClient({
  gatewayIp: '192.168.1.50',
  gatewayPort: 3671,
});

client.on('cemi', (frame) => console.log('rx cEMI', frame));
client.on('state', (next, prev) => console.log(`tunnel ${prev} → ${next}`));
client.on('error', (err) => console.error('tunnel error:', err));

await client.connect();

await client.groupValueWrite('1/2/3', smallValue(1)); // boolean ON
await client.groupValueRead('1/2/3');                 // response arrives via 'cemi'

await client.disconnect();
```

Decode telegrams with a DPT codec and keep a history with `BusMonitor` — both
re-exported from this package.

## Connection setup

Pick your case, then pass the minimum config to `new TunnelClient(options)`:

| Use case | Minimum config |
| --- | --- |
| **Plain UDP tunnel** | `gatewayIp`, `gatewayPort` (default 3671) |
| **KNX/IP Secure tunnel** (TCP) | `gatewayIp`, `gatewayPort`, `secure: { userId, userPassword, deviceAuthPassword? }` |
| **Discover gateways** on the LAN | `discoverGateways({ timeoutMs })` (static, no client) |

If you're unsure, start with the **plain UDP tunnel**.

### KNX/IP Secure tunnel

```ts
import { TunnelClient } from 'knx-ip-ts';

const client = new TunnelClient({
  gatewayIp: '192.168.1.50',
  gatewayPort: 3671,
  secure: {
    userId: 2,
    userPassword: 'tunnel-user-password',
    deviceAuthPassword: 'gateway-device-auth-code', // omit for single-password devices
  },
});

await client.connect();
```

The two-secret model follows the KNX IP Secure spec: the **device auth code**
authenticates the gateway identity; the **user id + user password** authenticate
the client. UIs that show a single password are conflating the two for
convenience — omit `deviceAuthPassword` only for non-ETS devices that don't
expose one (the `SESSION_RESPONSE` MAC is then not verified; see Security).

### Discover gateways

```ts
import { discoverGateways } from 'knx-ip-ts';

const gateways = await discoverGateways({ timeoutMs: 3000 });
for (const g of gateways) {
  console.log(g.friendlyName, `${g.address}:${g.port}`, g.individualAddress ?? '');
}
```

## API reference

### `TunnelClient` options

| Option | Default | Description |
| --- | --- | --- |
| `gatewayIp` | — *(required)* | KNX/IP interface address. |
| `gatewayPort` | `3671` | KNX/IP port. |
| `transport` | `'udp'` | `'udp'` or `'tcp'`. `secure` forces TCP. |
| `secure` | — | KNX/IP Secure credentials (see below). Enables TCP + `SECURE_WRAPPER`. |
| `localIp` / `localPort` | route-back | Local bind address; omit for HPAI route-back (`0.0.0.0:0`). |
| `routeBack` | derived | Force-override route-back. |
| `requestedIndividualAddress` | — | Requested tunnel IA (extended CRI). |
| `autoReconnect` | `true` | Reconnect on tunnel loss. |
| `autoReconnectWaitMs` | `3000` | Delay between reconnect attempts. |
| `heartbeatIntervalMs` | `20000` | Heartbeat cadence. |
| `logger` | no-op | `{ debug?, info?, warn?, error? }` sink. |

### `secure` options

| Option | Description |
| --- | --- |
| `userId` | Tunnelling user id (1…127). User 1 is management; runtime usually 2…127. |
| `userPassword` | Plaintext user password. |
| `deviceAuthPassword` | Plaintext device authentication code. Optional — omit for single-password devices. |
| `serialNumber` | uint48 sender serial (default fixed identifier). |
| `messageTag` | uint16 message tag (default `0`). |

### Methods

| Method | Description |
| --- | --- |
| `connect()` | Open the tunnel; resolves once connected. |
| `disconnect()` | Graceful disconnect. |
| `groupValueWrite(ga, value)` | Send a `GroupValue_Write`. `value` is an `APDUValue` (`smallValue(n)` for ≤6-bit, `bytesValue(buf)` otherwise). |
| `groupValueRead(ga)` | Send a `GroupValue_Read`; the response arrives on the `'cemi'` event. |

Lower-level helpers — `groupValueResponse`, `encodeApci`, `decodeApci`,
`smallValue`, `bytesValue`, frame primitives, and the full crypto surface — are
exported for advanced use (see *Low-level building blocks*).

### Events

| Event | Payload | Fires when |
| --- | --- | --- |
| `'cemi'` | cEMI frame | An `L_Data.ind` arrives (GroupValue write/response/read). |
| `'state'` | `(next, prev)` | Tunnel state changes. |
| `'error'` | `Error` | Unrecoverable communication error. |
| `'warning'` | `reason` | Recoverable issue (e.g. a dropped heartbeat). |

## Encode / decode DPT values

```ts
import { getDpt, hasDpt } from 'knx-ip-ts';

if (hasDpt('9.001')) {
  const codec = getDpt('9.001');   // 2-byte float (temperature)
  const buf = codec.encode(21.5);  // Buffer
  const v = codec.decode(buf);     // 21.5
}
```

Use the codec to produce bytes for a typed write (`bytesValue(buf)`), or to
decode incoming cEMI payloads. Supported DPT families: **1, 2, 3, 4, 5, 6, 7,
8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 26, 28, 29, 232, 235, 251**.

## Parse an ETS project

```ts
import { readFileSync } from 'node:fs';
import { ETSProjectMap } from 'knx-ip-ts';

const map = new ETSProjectMap();
const result = map.loadKnxproj(readFileSync('./MyProject.knxproj'), {
  password: 'my-project-password',
});
console.log(`${result.entries} entries (${result.withDpt} with DPT) — ${result.projectName}`);

const entry = map.get('1/2/3');
console.log(entry?.name, entry?.dpt);
```

`parseKnxproj` throws `KnxprojPasswordRequired` if the project is encrypted and
no password is given, and `KnxprojBadPassword` if it's wrong. CSV exports are
supported via `parseEtsCsv`.

## Security

KNX/IP Secure is hardened beyond "it encrypts":

- **Anti-replay:** inbound `SECURE_WRAPPER` frames are rejected unless their
  session sequence counter strictly advances — a captured frame can't be
  replayed onto the bus. The check runs *after* MAC verification, so an attacker
  can't advance the window with unauthenticated frames.
- **Constant-time MAC verification:** the `SESSION_RESPONSE` and
  `SECURE_WRAPPER` authentication tags are compared with a length-guarded
  constant-time equality, not a short-circuiting byte compare.
- **Crypto:** per-session AES-128-CCM with a key derived from an X25519 ECDH
  exchange; handshake MACs and PBKDF2 password hashes follow KNX 03_08_05
  (fixed salts, 65 536 iterations).

If `deviceAuthPassword` is omitted, the `SESSION_RESPONSE` MAC is **not**
verified — the session is still encrypted and the client is still authenticated,
but there's no anti-MITM guarantee on the gateway identity.

## Low-level building blocks

The high-level `TunnelClient` is built on smaller pieces, all exported:

- `UdpTransport`, `TcpTransport`, `Transport` — pluggable transports
- `SecureSession` — KNX IP Secure session state machine
- `KNXIPFrame`, `CEMIFrame`, `CEMILData`, `HPAI`, `CRI`, `CRD` — frame primitives
- `groupValueRead/Write/Response`, `encodeApci`, `decodeApci` — APCI helpers
- `encryptSecureWrapper`, `decryptSecureWrapper`, `aesCcmEncrypt`, `pbkdf2`,
  `generateX25519KeyPair`, `x25519SharedSecret` — Secure crypto primitives
- `BusMonitor` — bounded in-memory ring buffer + EventEmitter for telegrams
- `GroupAddress`, `IndividualAddress` — address parsing/formatting

See `src/index.ts` for the full export surface.

## How it differs

`knx-ip-ts` is a **library-first** KNX/IP engine: strict TypeScript, no native
dependencies, tree-shakable, and it exports the frame/APCI/crypto primitives so
you can build higher-level integrations on top — a backend service, an edge
gateway, a CLI tool, or a higher-level wrapper. It pairs a focused KNX/IP
tunneling/secure core with ETS `.knxproj` parsing and a security-hardened
receive path, rather than competing on raw protocol breadth.

## Examples

- **[`examples/web-monitor`](examples/web-monitor)** — a React + Node web app
  that connects a `TunnelClient`, decodes telegrams, and shows live group-object
  state. The intended shape for a real application.

> More standalone script examples (minimal listener, write+read, secure
> connect, discovery) are planned; the inline snippets above are copy-paste
> runnable today.

## Troubleshooting

- **The tunnel's source IA isn't what I set.** In tunnelling the gateway assigns
  the IA; `requestedIndividualAddress` is only a hint (extended CRI) and most
  gateways ignore it.
- **Secure connect fails with *"SESSION_RESPONSE MAC verification failed"*.**
  Wrong `deviceAuthPassword`. For single-password devices, omit it (the MAC check
  is skipped — see Security).
- **Reads/writes silently fail.** ETS uses UDP/TCP `3671`; check firewalls and,
  on multi-NIC hosts, set `localIp` to bind the interface that reaches the
  gateway.
- **Discovery finds nothing.** Raise `timeoutMs` and set `localIp` to the
  correct NIC; some interfaces only answer unicast or multicast search.

## Development

```bash
npm install
npm run build      # tsc → dist/
npm test           # node --test --import tsx
npm run lint       # biome
```

## Changelog

See [`CHANGELOG.md`](CHANGELOG.md).

## License

MIT — see [LICENSE](LICENSE). Copyright © 2026 Jamel Nacef.
