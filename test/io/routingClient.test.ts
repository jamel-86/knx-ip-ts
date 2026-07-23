import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import { type APDUValue, groupValueWrite, smallValue } from '../../src/core/apci';
import { GroupAddress, IndividualAddress } from '../../src/core/address';
import { CEMIFlags, CEMIFrame, CEMILData, CEMIMessageCode, DEFAULT_OUTGOING_FLAGS } from '../../src/core/cemi';
import { RoutingBusy, RoutingIndication, RoutingLostMessage } from '../../src/core/bodies';
import { KNXIPFrame } from '../../src/core/knxipFrame';
import { defaultTpci } from '../../src/core/telegram';
import { RoutingClient } from '../../src/io/routingClient';
import type { SocketAddress } from '../../src/io/udpTransport';
import type { Transport } from '../../src/io/transport';
import type { KNXIPFrame as Frame } from '../../src/core/knxipFrame';

// Minimal Transport-shaped mock: records what the client tries to send and lets
// the test inject inbound frames synchronously.
class MockTransport extends EventEmitter {
  readonly sent: Frame[] = [];
  bound: SocketAddress = { address: '127.0.0.1', port: 3671 };
  bind() {
    return Promise.resolve(this.bound);
  }
  send(frame: Frame): Promise<void> {
    this.sent.push(frame);
    return Promise.resolve();
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
  inject(frame: Frame) {
    this.emit('message', frame, { address: '1.2.3.4', port: 3671 });
  }
}

const PHYS = '1.1.50';

function indicationFrom(src: string, ga = '1/2/3', value: APDUValue = smallValue(1)): RoutingIndication {
  const dst = new GroupAddress(ga);
  const cemi = new CEMIFrame({
    code: CEMIMessageCode.L_DATA_IND,
    data: new CEMILData({
      flags: DEFAULT_OUTGOING_FLAGS | CEMIFlags.DESTINATION_GROUP_ADDRESS | CEMIFlags.PRIORITY_LOW,
      srcAddr: new IndividualAddress(src),
      dstAddr: dst,
      tpci: defaultTpci(dst),
      payload: groupValueWrite(value),
    }),
  });
  return new RoutingIndication({ cemi: cemi.toKnx() });
}

describe('RoutingClient inbound handling', () => {
  async function makeClient() {
    const transport = new MockTransport();
    const client = new RoutingClient({ physAddr: PHYS }, () => transport as unknown as Transport);
    await client.connect();
    return { transport, client };
  }

  it('emits "cemi" for a RoutingIndication from another source', async () => {
    const { transport, client } = await makeClient();
    const seen: CEMIFrame[] = [];
    client.on('cemi', (f: CEMIFrame) => seen.push(f));
    transport.inject(KNXIPFrame.fromBody(indicationFrom('1.1.99')));
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.data?.srcAddr.toString(), '1.1.99');
  });

  it('drops its own looped-back frames (echo filter)', async () => {
    const { transport, client } = await makeClient();
    const seen: CEMIFrame[] = [];
    client.on('cemi', (f: CEMIFrame) => seen.push(f));
    transport.inject(KNXIPFrame.fromBody(indicationFrom(PHYS))); // same src as physAddr
    assert.equal(seen.length, 0, 'own-source frame must be filtered');
  });

  it('honours ROUTING_BUSY: emits a warning and pauses subsequent sends', async () => {
    const { transport, client } = await makeClient();
    const warnings: string[] = [];
    client.on('warning', (msg: string) => warnings.push(msg));
    transport.inject(
      KNXIPFrame.fromBody(new RoutingBusy({ deviceState: 1, waitTimeMs: 60, controlField: 0 })),
    );
    assert.equal(warnings.length, 1);
    // Send immediately — should be delayed by ~the busy window.
    const t0 = Date.now();
    await client.groupValueWrite('1/2/3', smallValue(1));
    const elapsed = Date.now() - t0;
    assert.ok(elapsed >= 40, `expected send to be paused ~60ms, took ${elapsed}ms`);
    assert.equal(transport.sent.length, 1);
  });

  it('emits a warning on ROUTING_LOST_MESSAGE', async () => {
    const { transport, client } = await makeClient();
    const warnings: string[] = [];
    client.on('warning', (msg: string) => warnings.push(msg));
    transport.inject(KNXIPFrame.fromBody(new RoutingLostMessage({ numberOfLostMessages: 3 })));
    assert.match(warnings[0]!, /3 frame/);
  });
});

describe('RoutingClient outbound', () => {
  it('groupValueWrite sends a ROUTING_INDICATION: L_DATA_IND, src=physAddr, dst=ga', async () => {
    const transport = new MockTransport();
    const client = new RoutingClient({ physAddr: PHYS }, () => transport as unknown as Transport);
    await client.connect();

    await client.groupValueWrite('5/3/1', smallValue(1));

    assert.equal(transport.sent.length, 1);
    const out = transport.sent[0]!;
    assert.ok(out.body instanceof RoutingIndication, 'must multicast a RoutingIndication');
    const cemi = CEMIFrame.fromKnx(out.body.cemi).frame;
    assert.equal(cemi.code, CEMIMessageCode.L_DATA_IND, 'routing injects L_DATA_IND, not L_DATA_REQ');
    assert.equal(cemi.data?.srcAddr.toString(), PHYS);
    assert.equal(cemi.data?.dstAddr.toString(), '5/3/1');
  });
});
