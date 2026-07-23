import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { RoutingBusy, RoutingIndication, RoutingLostMessage } from '../../src/core/bodies';
import { KNXIPFrame } from '../../src/core/knxipFrame';

// Round-trip the three routing bodies through a full KNX/IP frame: serialize via
// KNXIPFrame.fromBody(...).toKnx(), parse back with KNXIPFrame.fromKnx(), and
// assert the service type + payload survive. Pins both the wire format and the
// parseBody dispatch (ROUTING_INDICATION 0x0530 / LOST 0x0531 / BUSY 0x0532).

const CEMI = Buffer.from([0x29, 0x00, 0xbc, 0xe0, 0x11, 0x01, 0x02, 0x03, 0x01, 0x00, 0x81]);

describe('ROUTING_INDICATION body round-trip', () => {
  it('serialises to 0x0610 0x0530 + cEMI and parses back unchanged', () => {
    const wire = KNXIPFrame.fromBody(new RoutingIndication({ cemi: CEMI })).toKnx();
    assert.deepEqual(Array.from(wire.subarray(0, 4)), [0x06, 0x10, 0x05, 0x30]);
    const { frame } = KNXIPFrame.fromKnx(wire);
    assert.ok(frame.body instanceof RoutingIndication);
    assert.deepEqual(Array.from(frame.body.cemi), Array.from(CEMI));
  });
});

describe('ROUTING_BUSY body round-trip', () => {
  it('serialises to 0x0610 0x0532 + 6-byte body and parses back', () => {
    const wire = KNXIPFrame.fromBody(
      new RoutingBusy({ deviceState: 0x02, waitTimeMs: 100, controlField: 0x1234 }),
    ).toKnx();
    assert.deepEqual(Array.from(wire.subarray(0, 4)), [0x06, 0x10, 0x05, 0x32]);
    assert.equal(wire.readUInt16BE(4), 6 + 6, 'total length = header(6) + body(6)');
    const body = KNXIPFrame.fromKnx(wire).frame.body as RoutingBusy;
    assert.ok(body instanceof RoutingBusy);
    assert.equal(body.deviceState, 0x02);
    assert.equal(body.waitTimeMs, 100);
    assert.equal(body.controlField, 0x1234);
  });
});

describe('ROUTING_LOST_MESSAGE body round-trip', () => {
  it('serialises to 0x0610 0x0531 + 4-byte body and parses back', () => {
    const wire = KNXIPFrame.fromBody(new RoutingLostMessage({ numberOfLostMessages: 42 })).toKnx();
    assert.deepEqual(Array.from(wire.subarray(0, 4)), [0x06, 0x10, 0x05, 0x31]);
    const body = KNXIPFrame.fromKnx(wire).frame.body as RoutingLostMessage;
    assert.ok(body instanceof RoutingLostMessage);
    assert.equal(body.numberOfLostMessages, 42);
  });
});
