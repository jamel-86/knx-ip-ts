import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { encodeApci, groupValueWrite, smallValue } from '../../src/core/apci';
import {
  CEMIFlags,
  CEMIFrame,
  CEMILData,
  CEMIMessageCode,
  DEFAULT_OUTGOING_FLAGS,
} from '../../src/core/cemi';
import { GroupAddress, IndividualAddress } from '../../src/core/address';
import { tDataGroup } from '../../src/core/tpci';
import { APCI_DATA_SECURE, encodeDataSecure } from '../../src/secure/dataSecure';
import {
  DataSecureAntiReplay,
  handleSecuredCemi,
  InMemoryDataSecureKeys,
} from '../../src/secure/dataSecureKeys';

const KEY = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');
const SRC = 0x1101; // 1.1.1
const GA = 0x0901;

/** Build an inbound cEMI whose APDU is a secured GroupValueWrite(`value`). */
function securedCemi(sequence: number, key = KEY, ga = GA, src = SRC): CEMIFrame {
  const plainApdu = encodeApci(groupValueWrite(smallValue(1))); // [0x00, 0x81]
  const secured = encodeDataSecure({
    tpci: 0, src, dst: ga, dstIsGroup: true, key, plain: plainApdu, sequence,
  });
  return new CEMIFrame({
    code: CEMIMessageCode.L_DATA_IND,
    data: new CEMILData({
      flags: DEFAULT_OUTGOING_FLAGS | CEMIFlags.DESTINATION_GROUP_ADDRESS,
      srcAddr: new IndividualAddress(src),
      dstAddr: new GroupAddress(ga),
      tpci: tDataGroup(),
      payload: { kind: 'Unknown', service: APCI_DATA_SECURE, raw: secured },
    }),
  });
}

describe('InMemoryDataSecureKeys — resolveKey', () => {
  it('resolves a group key by destination GA', () => {
    const k = new InMemoryDataSecureKeys().setGroupKey(GA, KEY);
    assert.equal(
      k.resolveKey({ src: SRC, dst: GA, dstIsGroup: true, toolAccess: false, systemBroadcast: false }),
      KEY,
    );
  });

  it('resolves a p2p key by source IA', () => {
    const k = new InMemoryDataSecureKeys().setP2pKey(SRC, KEY);
    assert.equal(
      k.resolveKey({ src: SRC, dst: 0x1102, dstIsGroup: false, toolAccess: false, systemBroadcast: false }),
      KEY,
    );
  });

  it('prefers the tool key for tool-access frames, falls back to p2p', () => {
    const tool = Buffer.alloc(16, 0xaa);
    const k = new InMemoryDataSecureKeys().setP2pKey(SRC, KEY).setToolKey(tool);
    assert.equal(
      k.resolveKey({ src: SRC, dst: 0, dstIsGroup: false, toolAccess: true, systemBroadcast: false }),
      tool,
    );
  });

  it('uses the backbone key for system broadcast', () => {
    const bb = Buffer.alloc(16, 0xbb);
    const k = new InMemoryDataSecureKeys().setBackboneKey(bb);
    assert.equal(
      k.resolveKey({ src: SRC, dst: 0, dstIsGroup: true, toolAccess: false, systemBroadcast: true }),
      bb,
    );
  });

  it('returns null when no key is configured', () => {
    const k = new InMemoryDataSecureKeys();
    assert.equal(
      k.resolveKey({ src: SRC, dst: GA, dstIsGroup: true, toolAccess: false, systemBroadcast: false }),
      null,
    );
  });
});

describe('DataSecureAntiReplay', () => {
  it('accepts strictly increasing sequences, rejects same/lower', () => {
    const ar = new DataSecureAntiReplay();
    assert.equal(ar.checkAndUpdate(SRC, 1), true);
    assert.equal(ar.checkAndUpdate(SRC, 2), true);
    assert.equal(ar.checkAndUpdate(SRC, 2), false); // same → replay
    assert.equal(ar.checkAndUpdate(SRC, 1), false); // lower → replay
    assert.equal(ar.checkAndUpdate(SRC, 3), true);
  });

  it('tracks per source independently', () => {
    const ar = new DataSecureAntiReplay();
    assert.equal(ar.checkAndUpdate(0x1101, 5), true);
    assert.equal(ar.checkAndUpdate(0x1102, 5), true); // different source, same seq → ok
  });
});

describe('handleSecuredCemi — transparent decrypt hook', () => {
  it('passes through a non-secured cEMI unchanged', () => {
    const cemi = new CEMIFrame({
      code: CEMIMessageCode.L_DATA_IND,
      data: new CEMILData({
        flags: DEFAULT_OUTGOING_FLAGS | CEMIFlags.DESTINATION_GROUP_ADDRESS,
        srcAddr: new IndividualAddress(SRC),
        dstAddr: new GroupAddress(GA),
        tpci: tDataGroup(),
        payload: groupValueWrite(smallValue(1)), // plain GroupWrite, not secured
      }),
    });
    const r = handleSecuredCemi(cemi, new InMemoryDataSecureKeys().setGroupKey(GA, KEY));
    assert.equal(r.kind, 'passthrough');
    assert.equal(cemi.data!.payload!.kind, 'GroupValueWrite'); // unchanged
  });

  it('decrypts a secured cEMI and swaps the payload for the real APCI', () => {
    const cemi = securedCemi(7);
    const keys = new InMemoryDataSecureKeys().setGroupKey(GA, KEY);
    const r = handleSecuredCemi(cemi, keys, new DataSecureAntiReplay());
    assert.equal(r.kind, 'decrypted');
    assert.equal(cemi.data!.payload!.kind, 'GroupValueWrite'); // payload replaced
  });

  it('drops when no key is configured for the GA', () => {
    const cemi = securedCemi(1);
    const r = handleSecuredCemi(cemi, new InMemoryDataSecureKeys()); // no group key
    assert.equal(r.kind, 'dropped');
    assert.match(r.kind === 'dropped' ? r.reason : '', /no key/);
  });

  it('drops on MAC mismatch (wrong key)', () => {
    const cemi = securedCemi(1, KEY);
    const wrong = Buffer.alloc(16, 0xff);
    const r = handleSecuredCemi(cemi, new InMemoryDataSecureKeys().setGroupKey(GA, wrong));
    assert.equal(r.kind, 'dropped');
    assert.match(r.kind === 'dropped' ? r.reason : '', /MAC/);
  });

  it('drops a replayed sequence from the same source', () => {
    const keys = new InMemoryDataSecureKeys().setGroupKey(GA, KEY);
    const replay = new DataSecureAntiReplay();
    const first = handleSecuredCemi(securedCemi(10), keys, replay);
    const second = handleSecuredCemi(securedCemi(10), keys, replay); // same seq
    assert.equal(first.kind, 'decrypted');
    assert.equal(second.kind, 'dropped');
    assert.match(second.kind === 'dropped' ? second.reason : '', /replay/);
  });

  it('passes through a secured cEMI when no resolver is configured (backward compat)', () => {
    const cemi = securedCemi(1);
    const r = handleSecuredCemi(cemi, null);
    assert.equal(r.kind, 'passthrough');
    assert.equal(cemi.data!.payload!.kind, 'Unknown'); // unchanged
  });

  // Crown jewel: a forged frame with a high sequence must NOT advance the
  // replay window. MAC verification runs BEFORE checkAndUpdate, so a forged
  // frame (wrong key → MAC fail → dropped) can't poison the window even if
  // its declared seq is higher than anything we've seen.
  it('does NOT advance the replay window on a forged frame (MAC fail before replay check)', () => {
    const keys = new InMemoryDataSecureKeys().setGroupKey(GA, KEY);
    const replay = new DataSecureAntiReplay();

    // 1) Accept seq 5.
    assert.equal(handleSecuredCemi(securedCemi(5), keys, replay).kind, 'decrypted');

    // 2) Forge seq 100 with the WRONG key → MAC fails → dropped.
    const forged = securedCemi(100, Buffer.alloc(16, 0xff));
    const r2 = handleSecuredCemi(forged, keys, replay);
    assert.equal(r2.kind, 'dropped');
    assert.match(r2.kind === 'dropped' ? r2.reason : '', /MAC/);

    // 3) A valid seq 6 (still > 5, but < 100) must STILL be accepted — proves
    //    the forged high-seq didn't advance the window past 6.
    assert.equal(handleSecuredCemi(securedCemi(6), keys, replay).kind, 'decrypted');
  });

  // Bug 1 fix: decodeApci on a malformed inner payload must not throw.
  it('drops without throwing when the decrypted payload is too short for an APCI', () => {
    const badPlain = Buffer.from([0x42]); // 1 byte — decodeApci requires >= 2
    const secured = encodeDataSecure({
      tpci: 0, src: SRC, dst: GA, dstIsGroup: true, key: KEY,
      plain: badPlain, sequence: 1,
    });
    const cemi = new CEMIFrame({
      code: CEMIMessageCode.L_DATA_IND,
      data: new CEMILData({
        flags: DEFAULT_OUTGOING_FLAGS | CEMIFlags.DESTINATION_GROUP_ADDRESS,
        srcAddr: new IndividualAddress(SRC),
        dstAddr: new GroupAddress(GA),
        tpci: tDataGroup(),
        payload: { kind: 'Unknown', service: APCI_DATA_SECURE, raw: secured },
      }),
    });
    const keys = new InMemoryDataSecureKeys().setGroupKey(GA, KEY);
    const r = handleSecuredCemi(cemi, keys, new DataSecureAntiReplay());
    assert.equal(r.kind, 'dropped');
    assert.match(r.kind === 'dropped' ? r.reason : '', /APDU/);
  });
});
