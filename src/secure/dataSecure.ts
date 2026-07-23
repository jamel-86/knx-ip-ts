// KNX Data Secure — group / point-to-point telegram security (03_05_01 §4.8 +
// the Data Secure addendum). Protects individual APDUs end-to-end, independent
// of the transport (TP or KNX/IP routing/tunnelling).
//
// A secured APDU (LSDU) carries the Data-Secure APCI (0x3F1) followed by a
// Security Control Field (SCF), a 6-byte sequence counter, the (optionally
// encrypted) inner payload, and a 4-byte truncated+encrypted MAC.
//
// Ported faithfully from lib-knx-stack/src/secure_data/secure_data.c — same
// block_0 / counter_0 layout, same KNX CBC-MAC + AES-CTR (reusing the IP-Secure
// primitives in ./crypto), same 4-byte tag. Decode throws on MAC mismatch.

import { aesCbcMac, aesCtrXor, constantTimeEquals } from './crypto';

export const APCI_DATA_SECURE = 0x3f1;

// SCF bits
export const SCF_TOOL_ACCESS = 0x80;
export const SCF_AUTH_CONF = 0x10; // bits [6:4] == 001 → authenticated + confidential
export const SCF_SYSTEM_BCAST = 0x08;

// Service (SCF bits [2:0])
export const SERVICE_DATA = 0;
export const SERVICE_SYNC_REQ = 2;
export const SERVICE_SYNC_RES = 3;

const KEY = 16;
const MAC_LEN = 4;
const MAX_PLAIN = 254;

/** True if `lsdu` (an APDU) carries the Data-Secure APCI. */
export function isDataSecureApdu(lsdu: Buffer): boolean {
  if (lsdu.length < 3) return false;
  const apci = ((lsdu[0]! & 0x03) << 8) | lsdu[1]!;
  return apci === APCI_DATA_SECURE;
}

// ---------- 48-bit BE helpers ----------

function readU48BE(buf: Buffer, off: number): number {
  return (buf[off]! * 0x10000000000 + buf[off + 1]! * 0x100000000 +
    buf[off + 2]! * 0x1000000 + buf[off + 3]! * 0x10000 +
    buf[off + 4]! * 0x100 + buf[off + 5]!);
}

function writeU48BE(buf: Buffer, off: number, v: number): void {
  if (!Number.isSafeInteger(v) || v < 0 || v > 0xffff_ffff_ffff) {
    throw new RangeError(`Data Secure sequence out of uint48 range: ${v}`);
  }
  // >>> is a 32-bit shift, so the top two bytes use division instead.
  buf[off] = Math.floor(v / 0x1_0000_0000_00) & 0xff; // bits 47..40
  buf[off + 1] = Math.floor(v / 0x1_0000_0000) & 0xff; // bits 39..32
  buf[off + 2] = (v >>> 24) & 0xff;
  buf[off + 3] = (v >>> 16) & 0xff;
  buf[off + 4] = (v >>> 8) & 0xff;
  buf[off + 5] = v & 0xff;
}

// Data-Secure block_0 for the CBC-MAC. q = authenticated payload length.
function makeBlock0(
  seq: number, src: number, dst: number, dstIsGroup: boolean, tpci: number, q: number,
): Buffer {
  const b = Buffer.alloc(KEY);
  writeU48BE(b, 0, seq);
  b.writeUInt16BE(src & 0xffff, 6);
  b.writeUInt16BE(dst & 0xffff, 8);
  b[10] = 0x00;
  b[11] = dstIsGroup ? 0x80 : 0x00;
  b[12] = (tpci & 0xfc) | ((APCI_DATA_SECURE >> 8) & 0x03);
  b[13] = APCI_DATA_SECURE & 0xff;
  b[14] = 0x00;
  b[15] = q & 0xff;
  return b;
}

// Initial counter block for AES-CTR (tag + payload encryption).
function makeCtr0(seq: number, src: number, dst: number): Buffer {
  const b = Buffer.alloc(KEY);
  writeU48BE(b, 0, seq);
  b.writeUInt16BE(src & 0xffff, 6);
  b.writeUInt16BE(dst & 0xffff, 8);
  b[10] = 0x00;
  b[11] = 0x00;
  b[12] = 0x00;
  b[13] = 0x00;
  b[14] = 0x01;
  b[15] = 0x00;
  return b;
}

// ---------- decode ----------

export interface DataSecureDecodeInput {
  /** Full secured APDU (LSDU) — APCI + SCF + seq + body. */
  lsdu: Buffer;
  /** Source individual address (raw uint16). */
  src: number;
  /** Destination (raw uint16). */
  dst: number;
  /** True when `dst` is a group address (else individual). */
  dstIsGroup: boolean;
  /** 16-byte key for this GA (group comms) or source IA (p2p). */
  key: Buffer;
}

export interface DataSecurePdu {
  service: number;
  toolAccess: boolean;
  authConf: boolean;
  systemBroadcast: boolean;
  sequence: number;
  /** SYNC_REQ sender serial (6 bytes), when present. */
  serial?: Buffer;
  /** Decrypted inner payload (plain APDU body). */
  plain: Buffer;
}

/** Decrypt + verify a secured APDU. Throws on MAC mismatch / malformed input. */
export function decodeDataSecure(opts: DataSecureDecodeInput): DataSecurePdu {
  const { lsdu, src, dst, dstIsGroup, key } = opts;
  if (key.length !== KEY) throw new RangeError(`Data Secure key must be ${KEY} bytes`);
  if (!isDataSecureApdu(lsdu)) throw new Error('Not a Data Secure APDU');

  const scf = lsdu[2]!;
  const service = scf & 0x07;
  const toolAccess = (scf & SCF_TOOL_ACCESS) !== 0;
  const authConf = ((scf >> 4) & 0x07) === 1;
  const systemBroadcast = (scf & SCF_SYSTEM_BCAST) !== 0;
  const tpci = lsdu[0]! & 0xfc;
  const meta = { service, toolAccess, authConf, systemBroadcast };

  if (service === SERVICE_SYNC_REQ) {
    if (!authConf) throw new Error('SYNC_REQ must be auth+conf');
    if (lsdu.length < 25) throw new Error('Data Secure SYNC_REQ too short');
    const sequence = readU48BE(lsdu, 3);
    const serial = Buffer.from(lsdu.subarray(9, 15));
    const ad = Buffer.concat([Buffer.from([scf]), serial]); // 7 bytes
    const cipher = lsdu.subarray(15, 21); // 6 bytes
    const encMac = lsdu.subarray(lsdu.length - MAC_LEN);
    const plain = decryptAuthConf(key, sequence, src, dst, dstIsGroup, tpci, ad, cipher, encMac);
    return { ...meta, sequence, serial, plain };
  }

  if (service === SERVICE_DATA) {
    if (lsdu.length < 13) throw new Error('Data Secure DATA too short');
    const sequence = readU48BE(lsdu, 3);
    const body = lsdu.subarray(9);
    const plainLen = body.length - MAC_LEN;
    if (plainLen < 0 || plainLen > MAX_PLAIN) throw new Error('Data Secure DATA length out of range');
    const encMac = body.subarray(plainLen);
    if (authConf) {
      const cipher = body.subarray(0, plainLen);
      const ad = Buffer.from([scf]);
      const plain = decryptAuthConf(key, sequence, src, dst, dstIsGroup, tpci, ad, cipher, encMac);
      return { ...meta, sequence, plain };
    }
    const plain = Buffer.from(body.subarray(0, plainLen));
    verifyAuthOnly(key, sequence, src, dst, dstIsGroup, tpci, plain, encMac);
    return { ...meta, sequence, plain };
  }

  throw new Error(`Unsupported Data Secure service ${service}`);
}

/** Decrypt + verify an auth+conf payload. Returns the plaintext. */
function decryptAuthConf(
  key: Buffer, seq: number, src: number, dst: number, dstIsGroup: boolean, tpci: number,
  ad: Buffer, cipher: Buffer, encMac: Buffer,
): Buffer {
  const ctr0 = makeCtr0(seq, src, dst);
  const tmp = aesCtrXor(key, ctr0, Buffer.concat([encMac, cipher]));
  const decMac = tmp.subarray(0, MAC_LEN);
  const plain = tmp.subarray(MAC_LEN);
  const b0 = makeBlock0(seq, src, dst, dstIsGroup, tpci, cipher.length);
  const mac = aesCbcMac({ key, additionalData: ad, payload: plain, block0: b0 });
  if (!constantTimeEquals(decMac, mac.subarray(0, MAC_LEN))) {
    throw new Error('Data Secure MAC verification failed');
  }
  return Buffer.from(plain);
}

/** Verify an auth-only payload (plaintext + MAC). */
function verifyAuthOnly(
  key: Buffer, seq: number, src: number, dst: number, dstIsGroup: boolean, tpci: number,
  plain: Buffer, encMac: Buffer,
): void {
  const b0 = makeBlock0(seq, src, dst, dstIsGroup, tpci, plain.length);
  const mac = aesCbcMac({ key, additionalData: Buffer.alloc(0), payload: plain, block0: b0 });
  const ctr0 = makeCtr0(seq, src, dst);
  const decMac = aesCtrXor(key, ctr0, encMac).subarray(0, MAC_LEN);
  if (!constantTimeEquals(decMac, mac.subarray(0, MAC_LEN))) {
    throw new Error('Data Secure MAC verification failed (auth-only)');
  }
}

// ---------- encode (for tests + future send path) ----------

export interface DataSecureEncodeInput {
  tpci: number;
  src: number;
  dst: number;
  dstIsGroup: boolean;
  key: Buffer;
  toolAccess?: boolean;
  /** Authenticated + confidential (encrypted). Default true. */
  authConf?: boolean;
  plain: Buffer;
  sequence: number;
}

/** Build a secured DATA APDU. Mirrors secure_data.c::knx_data_secure_build_data_ex. */
export function encodeDataSecure(opts: DataSecureEncodeInput): Buffer {
  const { tpci, src, dst, dstIsGroup, key, plain, sequence } = opts;
  if (key.length !== KEY) throw new RangeError(`Data Secure key must be ${KEY} bytes`);
  if (plain.length === 0 || plain.length > MAX_PLAIN) {
    throw new RangeError(`Data Secure payload out of range (1..${MAX_PLAIN})`);
  }
  const toolAccess = opts.toolAccess ?? false;
  const authConf = opts.authConf ?? true;
  const scf =
    (authConf ? SCF_AUTH_CONF : 0) | (toolAccess ? SCF_TOOL_ACCESS : 0) | SERVICE_DATA;

  const out = Buffer.alloc(9 + plain.length + MAC_LEN);
  out[0] = (tpci & 0xfc) | ((APCI_DATA_SECURE >> 8) & 0x03);
  out[1] = APCI_DATA_SECURE & 0xff;
  out[2] = scf;
  writeU48BE(out, 3, sequence);

  if (authConf) {
    const ad = Buffer.from([scf]);
    const { cipher, encMac } = encryptAuthConf(
      key, sequence, src, dst, dstIsGroup, tpci, ad, plain,
    );
    cipher.copy(out, 9);
    encMac.copy(out, 9 + plain.length);
  } else {
    plain.copy(out, 9);
    const encMac = encryptAuthOnly(key, sequence, src, dst, dstIsGroup, tpci, plain);
    encMac.copy(out, 9 + plain.length);
  }
  return out;
}

function encryptAuthConf(
  key: Buffer, seq: number, src: number, dst: number, dstIsGroup: boolean, tpci: number,
  ad: Buffer, plain: Buffer,
): { cipher: Buffer; encMac: Buffer } {
  const b0 = makeBlock0(seq, src, dst, dstIsGroup, tpci, plain.length);
  const mac = aesCbcMac({ key, additionalData: ad, payload: plain, block0: b0 });
  const ctr0 = makeCtr0(seq, src, dst);
  const crypt = aesCtrXor(key, ctr0, Buffer.concat([mac.subarray(0, MAC_LEN), plain]));
  return { encMac: crypt.subarray(0, MAC_LEN), cipher: Buffer.from(crypt.subarray(MAC_LEN)) };
}

function encryptAuthOnly(
  key: Buffer, seq: number, src: number, dst: number, dstIsGroup: boolean, tpci: number,
  plain: Buffer,
): Buffer {
  const b0 = makeBlock0(seq, src, dst, dstIsGroup, tpci, plain.length);
  const mac = aesCbcMac({ key, additionalData: Buffer.alloc(0), payload: plain, block0: b0 });
  const ctr0 = makeCtr0(seq, src, dst);
  return aesCtrXor(key, ctr0, mac.subarray(0, MAC_LEN));
}
