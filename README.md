# @jamel-86/knx-ip-ts

A pure-TypeScript KNX/IP client library for Node.js. No Node-RED required.

- KNX/IP **tunnelling over UDP** with heartbeat, send mutex, and auto-reconnect
- **KNX IP Secure** tunnelling over TCP (X25519 handshake + AES-CCM wrapper)
- **Gateway discovery** via SEARCH_REQUEST
- **DPT codecs** for the common types (1/2/3/4/5/6/7/8/9/10/11/12/13/14/16/17/18/19/20/26/28/29/232/235/251)
- **ETS `.knxproj`** parsing — including password-protected projects
- Multiple concurrent tunnels, no module-level singletons

Extracted from [`node-red-contrib-eelectron-knxip`](https://github.com/eelectronspa/node-red-contrib-eelectron-knxip).

## Install

```bash
npm install @jamel-86/knx-ip-ts
```

Requires Node.js ≥ 18.

## Quick start — tunnel a GroupValueWrite

```ts
import { TunnelClient, smallValue } from '@jamel-86/knx-ip-ts';

const client = new TunnelClient({
  gatewayIp: '192.168.1.50',
  gatewayPort: 3671,
});

// Subscribe to raw incoming cEMI frames (L_DATA.ind, etc.)
client.on('cemi', (frame) => {
  console.log('rx cEMI', frame);
});

client.on('state', (next, prev) => console.log(`tunnel ${prev} → ${next}`));
client.on('error', (err) => console.error('tunnel error:', err));

await client.connect();

// Write boolean ON to GA 1/2/3
await client.groupValueWrite('1/2/3', smallValue(1));

// Read GA 1/2/3 — the response arrives via the 'cemi' event
await client.groupValueRead('1/2/3');

await client.disconnect();
```

For decoded telegrams + an in-memory ring buffer, wire a `BusMonitor` to the `cemi` event yourself, or use the lower-level CEMI helpers re-exported from this package.

## Discover gateways on the LAN

```ts
import { discoverGateways } from '@jamel-86/knx-ip-ts';

const gateways = await discoverGateways({ timeoutMs: 3000 });
for (const g of gateways) {
  console.log(g.friendlyName, `${g.address}:${g.port}`, g.individualAddress ?? '');
}
```

## KNX IP Secure tunnel

```ts
import { TunnelClient } from '@jamel-86/knx-ip-ts';

const client = new TunnelClient({
  gatewayIp: '192.168.1.50',
  gatewayPort: 3671,
  secure: {
    userId: 2,
    userPassword: 'tunnel-user-password',
    // Optional: omit for single-password devices that don't expose
    // a separate device-authentication code.
    deviceAuthPassword: 'gateway-device-auth-code',
  },
});

await client.connect();
```

The two-secret model (DeviceAuthCode = gateway identity; UserID/Password = client identity) follows the KNX IP Secure spec; UIs that show a single password are conflating the two for convenience.

## Encode / decode DPT values

```ts
import { getDpt, hasDpt } from '@jamel-86/knx-ip-ts';

if (hasDpt('9.001')) {
  const codec = getDpt('9.001');         // 2-byte float (temperature)
  const buf = codec.encode(21.5);
  const value = codec.decode(buf);       // 21.5
}
```

## Parse an ETS project

```ts
import { readFileSync } from 'node:fs';
import { ETSProjectMap } from '@jamel-86/knx-ip-ts';

const buf = readFileSync('./MyProject.knxproj');
const map = new ETSProjectMap();
const result = map.loadKnxproj(buf, { password: 'my-project-password' });
console.log(`loaded ${result.entries} entries (${result.withDpt} with DPT) from ${result.projectName}`);

const entry = map.get('1/2/3');
console.log(entry?.name, entry?.dpt);
```

`parseKnxproj` throws `KnxprojPasswordRequired` if the project is encrypted and no password was passed, and `KnxprojBadPassword` if the password is wrong.

## Advanced — low-level building blocks

The high-level `TunnelClient` is built on smaller pieces that are also exported:

- `UdpTransport`, `TcpTransport`, `Transport` — pluggable transports
- `SecureSession` — KNX IP Secure session state machine
- `KNXIPFrame`, `KNXIPHeader`, `CEMIFrame`, `CEMILData` — frame primitives
- `groupValueRead`, `groupValueWrite`, `groupValueResponse`, `encodeApci`, `decodeApci` — APCI helpers
- `encryptSecureWrapper`, `decryptSecureWrapper`, `aesCcmEncrypt`, `pbkdf2`, … — Secure crypto primitives
- `BusMonitor` — bounded in-memory ring buffer + EventEmitter for telegrams

See `src/index.ts` for the full export surface.

## Development

```bash
npm install
npm run build      # tsc → dist/
npm test           # node --test --import tsx
npm run lint
```

## License

Apache-2.0. See `LICENSE` and `NOTICE`.
