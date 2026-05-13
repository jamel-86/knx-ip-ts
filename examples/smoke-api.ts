// Compile-time smoke test: imports the most-used public symbols and exercises
// a pure (non-networking) slice of the API to prove the package shape is sane.
//
// Run with:  npx tsx examples/smoke-api.ts

import {
  CEMIFlags,
  CEMILData,
  DEFAULT_OUTGOING_FLAGS,
  GroupAddress,
  IndividualAddress,
  TunnelClient,
  defaultTpci,
  discoverGateways,
  getDpt,
  groupValueWrite,
  hasDpt,
  listDpts,
  normalizeDptId,
  smallValue,
  telegramFromGroupWrite,
  type DPTCodec,
  type DiscoveredGateway,
  type Telegram,
  type TunnelClientOptions,
} from '../src/index';

// 1) Addresses round-trip
const ia = new IndividualAddress('1.1.42');
const ga = new GroupAddress('1/2/3');
console.log('individual:', ia.toString(), 'group:', ga.toString());

// 2) DPT registry is populated by importing the index module
console.log('DPT count:', listDpts().length, 'has 1.001:', hasDpt('1.001'));
const dpt1: DPTCodec<unknown> = getDpt('1.001');
const encoded = dpt1.encode(true);
const decoded = dpt1.decode(encoded);
console.log('DPT 1.001 round-trip:', decoded);

// 3) Build a telegram + cEMI frame for a GroupValueWrite of "on"
const telegram: Telegram = telegramFromGroupWrite(ga, smallValue(1), { source: ia });
const cemi = new CEMILData({
  flags: DEFAULT_OUTGOING_FLAGS,
  srcAddr: telegram.sourceAddress,
  dstAddr: telegram.destinationAddress,
  tpci: telegram.tpci,
  payload: telegram.payload,
});
console.log('cEMI bytes:', cemi.toKnx().toString('hex'));

// 4) Normalise a DPT id the way ETS exports it
console.log('normalize "DPST-1-1":', normalizeDptId('DPST-1-1'));

// 5) Build a tunnel client (do NOT call connect — network-free smoke)
const opts: TunnelClientOptions = { gatewayIp: '127.0.0.1', gatewayPort: 3671 };
const client = new TunnelClient(opts);
console.log('tunnel state:', client.state);

// 6) Fire a short discovery (likely no replies on isolated dev hosts)
discoverGateways({ timeoutMs: 200 })
  .then((found: DiscoveredGateway[]) => {
    console.log('discovery: found', found.length, 'gateways');
  })
  .catch((err) => {
    console.log('discovery error (expected on isolated dev hosts):', err.message);
  });

// Type-only references to make TS keep the rest of the imports
void CEMIFlags;
void groupValueWrite;
