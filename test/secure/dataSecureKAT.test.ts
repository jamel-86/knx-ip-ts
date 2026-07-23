import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { decodeDataSecure, encodeDataSecure } from '../../src/secure/dataSecure';

// KNX spec known-answer vectors — 03_07 Application Layer v02.01.01, Annex C.1.1
// and C.1.2 (pp. 187–188). These independently prove the codec is conformant to
// the KNX spec wire format, not just to the C port. Decode recovers the exact
// plaintext; encode reproduces the exact secured LSDU (cipher + MAC) with zero
// diff.
//
// Key: the spec's worked-example Tool Key (Annex C).
// SCF: 0x90 = authConf + toolAccess, service = DATA.
// Common: dstIsGroup = false, tpci = 0.

const KEY = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');

describe('Data Secure — KNX spec Annex C KAT vectors', () => {
  describe('C.1.1 (src=0xFF67, dst=0xFF00, seq=4)', () => {
    const SRC = 0xff67;
    const DST = 0xff00;
    const SEQ = 4;
    const PLAIN = Buffer.from(
      '03D705351001202122232425262728292A2B2C2D2E2F',
      'hex',
    );
    const SECURED = Buffer.concat([
      Buffer.from('03F190000000000004', 'hex'), // APCI + SCF + seq(6)
      Buffer.from(
        '6767242A2308CA76A11774214EE4CF5D94909F743D05',
        'hex',
      ), // cipher (22 bytes)
      Buffer.from('0D8FC168', 'hex'), // MAC (4 bytes)
    ]);

    it('decode → exact plaintext + sequence', () => {
      const pdu = decodeDataSecure({
        lsdu: SECURED,
        src: SRC,
        dst: DST,
        dstIsGroup: false,
        key: KEY,
      });
      assert.deepEqual(Array.from(pdu.plain), Array.from(PLAIN));
      assert.equal(pdu.sequence, SEQ);
      assert.equal(pdu.authConf, true);
      assert.equal(pdu.toolAccess, true);
    });

    it('encode → exact secured LSDU (cipher + MAC, zero diff)', () => {
      const out = encodeDataSecure({
        tpci: 0,
        src: SRC,
        dst: DST,
        dstIsGroup: false,
        key: KEY,
        plain: PLAIN,
        sequence: SEQ,
        authConf: true,
        toolAccess: true,
      });
      assert.deepEqual(Array.from(out), Array.from(SECURED));
    });
  });

  describe('C.1.2 (src=0xFF00, dst=0xFF67, seq=3)', () => {
    const SRC = 0xff00;
    const DST = 0xff67;
    const SEQ = 3;
    const PLAIN = Buffer.from(
      '03D605351001202122232425262728292A2B2C2D2E2F',
      'hex',
    );
    const SECURED = Buffer.concat([
      Buffer.from('03F190000000000003', 'hex'),
      Buffer.from(
        '706F533105503557CB2B24F1DD341B60B7E017ECD6B0',
        'hex',
      ),
      Buffer.from('6849A72B', 'hex'),
    ]);

    it('decode → exact plaintext + sequence', () => {
      const pdu = decodeDataSecure({
        lsdu: SECURED,
        src: SRC,
        dst: DST,
        dstIsGroup: false,
        key: KEY,
      });
      assert.deepEqual(Array.from(pdu.plain), Array.from(PLAIN));
      assert.equal(pdu.sequence, SEQ);
    });

    it('encode → exact secured LSDU (cipher + MAC, zero diff)', () => {
      const out = encodeDataSecure({
        tpci: 0,
        src: SRC,
        dst: DST,
        dstIsGroup: false,
        key: KEY,
        plain: PLAIN,
        sequence: SEQ,
        authConf: true,
        toolAccess: true,
      });
      assert.deepEqual(Array.from(out), Array.from(SECURED));
    });
  });
});
