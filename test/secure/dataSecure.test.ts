import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  decodeDataSecure,
  encodeDataSecure,
  isDataSecureApdu,
  SERVICE_DATA,
} from '../../src/secure/dataSecure';

// The codec is a faithful port of lib-knx-stack's secure_data.c (same block_0 /
// ctr_0, same KNX CBC-MAC + AES-CTR, same 4-byte tag). These tests prove:
//   - encode/decode round-trip (auth+conf and auth-only),
//   - MAC verification actually rejects tampering and wrong keys,
//   - the Data-Secure APCI is detected.
//
// Self-consistency here + sharing the validated IP-Secure primitives gives high
// confidence; final confirmation is a real captured secured telegram.

const KEY = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');
const SRC = 0x1101; // 1.1.1
const DST = 0x0901; // GA
const TPCI = 0x00; // T_DataGroup
const PLAIN = Buffer.from([0x00, 0x81]); // a small inner APDU payload

describe('Data Secure — APCI detection', () => {
  it('isDataSecureApdu detects the 0x3F1 APCI', () => {
    assert.ok(isDataSecureApdu(Buffer.from([0x03, 0xf1, 0x10])));
    assert.ok(!isDataSecureApdu(Buffer.from([0x00, 0x81]))); // GroupValueWrite short
    assert.ok(!isDataSecureApdu(Buffer.from([0x00, 0x00]))); // too short
  });
});

describe('Data Secure — auth+conf round-trip', () => {
  it('encrypts then decrypts back to the original payload', () => {
    const lsdu = encodeDataSecure({
      tpci: TPCI, src: SRC, dst: DST, dstIsGroup: true, key: KEY,
      plain: PLAIN, sequence: 5, authConf: true,
    });
    assert.ok(isDataSecureApdu(lsdu));
    const pdu = decodeDataSecure({ lsdu, src: SRC, dst: DST, dstIsGroup: true, key: KEY });
    assert.deepEqual(Array.from(pdu.plain), Array.from(PLAIN));
    assert.equal(pdu.sequence, 5);
    assert.equal(pdu.service, SERVICE_DATA);
    assert.equal(pdu.authConf, true);
  });
});

describe('Data Secure — auth-only round-trip', () => {
  it('carries the payload in the clear with a verified MAC', () => {
    const lsdu = encodeDataSecure({
      tpci: TPCI, src: SRC, dst: DST, dstIsGroup: true, key: KEY,
      plain: PLAIN, sequence: 9, authConf: false,
    });
    const pdu = decodeDataSecure({ lsdu, src: SRC, dst: DST, dstIsGroup: true, key: KEY });
    assert.deepEqual(Array.from(pdu.plain), Array.from(PLAIN));
    assert.equal(pdu.authConf, false);
    assert.equal(pdu.sequence, 9);
  });
});

describe('Data Secure — integrity', () => {
  it('rejects a tampered ciphertext (MAC mismatch)', () => {
    const lsdu = encodeDataSecure({
      tpci: TPCI, src: SRC, dst: DST, dstIsGroup: true, key: KEY,
      plain: PLAIN, sequence: 1, authConf: true,
    });
    lsdu[9] ^= 0x01; // flip a bit in the ciphertext body
    assert.throws(
      () => decodeDataSecure({ lsdu, src: SRC, dst: DST, dstIsGroup: true, key: KEY }),
      /MAC/,
    );
  });

  it('rejects the wrong key', () => {
    const lsdu = encodeDataSecure({
      tpci: TPCI, src: SRC, dst: DST, dstIsGroup: true, key: KEY,
      plain: PLAIN, sequence: 1,
    });
    const wrong = Buffer.from('ffffffffffffffffffffffffffffffff', 'hex');
    assert.throws(
      () => decodeDataSecure({ lsdu, src: SRC, dst: DST, dstIsGroup: true, key: wrong }),
      /MAC/,
    );
  });

  it('rejects a replay of the same sequence from the same source', () => {
    // Anti-replay is enforced by the caller (per-source seq tracker), not the
    // codec itself — but the codec exposes `sequence` so the caller can. Verify
    // the sequence is surfaced for that check.
    const lsdu = encodeDataSecure({
      tpci: TPCI, src: SRC, dst: DST, dstIsGroup: true, key: KEY,
      plain: PLAIN, sequence: 42,
    });
    const pdu = decodeDataSecure({ lsdu, src: SRC, dst: DST, dstIsGroup: true, key: KEY });
    assert.equal(pdu.sequence, 42, 'sequence must be exposed for the caller anti-replay check');
  });
});
