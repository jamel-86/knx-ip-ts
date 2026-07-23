// KNX-spec known-answer test — 03_07 Application Layer v02.01.01, Annex C.1.1 & C.1.2.
import { decodeDataSecure, encodeDataSecure } from '../src/secure/dataSecure';
const h = (s: string) => Buffer.from(s.replace(/\s/g, ''), 'hex');
const key = h('000102030405060708090a0b0c0d0e0f');
let fail = 0;
const eq = (name: string, got: Buffer, want: Buffer) => {
  const ok = got.equals(want);
  if (!ok) fail++;
  console.log(`  ${ok ? '✓' : '✗ FAIL'} ${name}`);
  if (!ok) console.log(`      got : ${got.toString('hex')}\n      want: ${want.toString('hex')}`);
};

for (const [id, src, dst, seq, plainHex, securedHex] of [
  ['C.1.1', 0xff67, 0xff00, 4,
    '03d70535100120212223242526272829 2a2b2c2d2e2f',
    '03f190 000000000004 6767242a2308ca76a11774214ee4cf5d94909f743d05 0d8fc168'],
  ['C.1.2', 0xff00, 0xff67, 3,
    '03d60535100120212223242526272829 2a2b2c2d2e2f',
    '03f190 000000000003 706f533105503557cb2b24f1dd341b60b7e017ecd6b0 6849a72b'],
] as const) {
  const plain = h(plainHex);
  const secured = h(securedHex);
  console.log(`Annex ${id}  (SA=${src.toString(16)} DA=${dst.toString(16)} seq=${seq})`);
  // DECODE the spec's secured bytes -> must recover plaintext
  const pdu = decodeDataSecure({ lsdu: secured, src, dst, dstIsGroup: false, key });
  eq('decode -> plaintext', pdu.plain, plain);
  console.log(`      (sequence decoded = ${pdu.sequence}, expected ${seq})`);
  if (pdu.sequence !== seq) fail++;
  // ENCODE plaintext -> must reproduce the spec's exact secured bytes
  const built = encodeDataSecure({
    tpci: 0, src, dst, dstIsGroup: false, key, plain, sequence: seq,
    authConf: true, toolAccess: true,
  });
  eq('encode -> spec secured bytes (byte-for-byte)', built, secured);
}
console.log(`\n==> ${fail} KAT failure(s)`);
process.exit(fail ? 1 : 0);
