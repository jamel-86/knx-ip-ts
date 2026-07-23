// Data Secure key resolution + anti-replay + the inbound cEMI decrypt hook.
//
// `handleSecuredCemi()` is the transparent integration point used by
// RoutingClient / TunnelClient: if an inbound cEMI carries a Data-Secure APDU
// and a key is available, it decrypts in place and swaps the payload for the
// real service APCI (GroupValueWrite/Read/…), so the application sees a normal
// 'cemi' frame. Frames it can't decrypt (no key / MAC fail / replay) are
// dropped with a reason the caller can surface as a 'warning'.

import { decodeApci } from '../core/apci';
import { CEMIFlags, type CEMIFrame } from '../core/cemi';
import {
  APCI_DATA_SECURE,
  type DataSecurePdu,
  decodeDataSecure,
  SCF_SYSTEM_BCAST,
  SCF_TOOL_ACCESS,
  SERVICE_DATA,
} from './dataSecure';

export interface DataSecureKeyContext {
  src: number;
  dst: number;
  dstIsGroup: boolean;
  toolAccess: boolean;
  systemBroadcast: boolean;
}

export interface DataSecureKeyResolver {
  resolveKey(ctx: DataSecureKeyContext): Buffer | null;
}

/**
 * Simple in-memory key store. Group comms resolve by destination GA; point-to-
 * point by source IA; tool-access prefers a dedicated tool key (falls back to
 * the source's p2p key); system-broadcast uses the backbone key.
 */
export class InMemoryDataSecureKeys implements DataSecureKeyResolver {
  private readonly _group = new Map<number, Buffer>();
  private readonly _p2p = new Map<number, Buffer>();
  private _tool: Buffer | null = null;
  private _backbone: Buffer | null = null;

  setGroupKey(groupAddress: number, key: Buffer): this {
    this._group.set(groupAddress & 0xffff, key);
    return this;
  }
  setP2pKey(individualAddress: number, key: Buffer): this {
    this._p2p.set(individualAddress & 0xffff, key);
    return this;
  }
  setToolKey(key: Buffer): this {
    this._tool = key;
    return this;
  }
  setBackboneKey(key: Buffer): this {
    this._backbone = key;
    return this;
  }

  resolveKey(ctx: DataSecureKeyContext): Buffer | null {
    if (ctx.systemBroadcast) return this._backbone;
    if (ctx.toolAccess) return this._tool ?? this._p2p.get(ctx.src) ?? null;
    if (ctx.dstIsGroup) return this._group.get(ctx.dst) ?? null;
    return this._p2p.get(ctx.src) ?? null;
  }
}

/**
 * Per-source sequence tracker. Accepts only strictly-increasing sequence
 * numbers from each source (correct for ordered transports — TCP tunnel, and
 * the common multicast case). A sliding window would be needed to tolerate
 * UDP reordering; that's a future refinement.
 *
 * State is in-memory and per-instance — it resets on restart, which reopens a
 * short replay window for previously-seen sequences. KNX devices persist the
 * last-seen seq in the security interface object; for a client library this is
 * acceptable.
 */
export class DataSecureAntiReplay {
  private readonly _last = new Map<number, number>();

  /** True if `seq` is greater than the last accepted sequence from `src`. */
  checkAndUpdate(src: number, seq: number): boolean {
    const prev = this._last.get(src);
    if (prev !== undefined && seq <= prev) return false;
    this._last.set(src, seq);
    return true;
  }

  reset(src?: number): void {
    if (src === undefined) this._last.clear();
    else this._last.delete(src);
  }
}

export type HandleSecuredResult =
  | { readonly kind: 'passthrough' }
  | { readonly kind: 'decrypted' }
  | { readonly kind: 'dropped'; readonly reason: string };

/**
 * Decrypt a Data-Secure APDU in an inbound cEMI, in place. Mutates
 * `cemi.data.payload` to the decrypted service APCI when decryption succeeds.
 *
 * - Not a secured APDU → `'passthrough'` (emit unchanged).
 * - Secured but no resolver configured → `'passthrough'` (backward compatible).
 * - Secured, resolver configured, but no key / MAC fail / replay → `'dropped'`.
 * - Decrypted → `'decrypted'` (payload swapped for the real APCI).
 */
export function handleSecuredCemi(
  cemi: CEMIFrame,
  resolver?: DataSecureKeyResolver | null,
  antiReplay?: DataSecureAntiReplay | null,
): HandleSecuredResult {
  const data = cemi.data;
  if (!data) return { kind: 'passthrough' };
  const pl = data.payload;
  if (pl === null || pl.kind !== 'Unknown' || pl.service !== APCI_DATA_SECURE) {
    return { kind: 'passthrough' };
  }
  if (!resolver) return { kind: 'passthrough' }; // Data Secure not configured

  const lsdu = pl.raw;
  if (lsdu.length < 3) return { kind: 'dropped', reason: 'secured APDU too short' };
  const scf = lsdu[2]!;
  const ctx: DataSecureKeyContext = {
    src: data.srcAddr.raw,
    dst: data.dstAddr.raw,
    dstIsGroup: (data.flags & CEMIFlags.DESTINATION_GROUP_ADDRESS) !== 0,
    toolAccess: (scf & SCF_TOOL_ACCESS) !== 0,
    systemBroadcast: (scf & SCF_SYSTEM_BCAST) !== 0,
  };

  const key = resolver.resolveKey(ctx);
  if (!key) {
    return {
      kind: 'dropped',
      reason: `no key for ${ctx.dstIsGroup ? 'GA' : 'IA'} 0x${ctx.dst.toString(16)}`,
    };
  }

  let pdu: DataSecurePdu;
  try {
    pdu = decodeDataSecure({ lsdu, key, ...ctx });
  } catch (err) {
    return { kind: 'dropped', reason: `decode/MAC failed: ${(err as Error).message}` };
  }

  // Only DATA telegrams carry a service APCI to re-parse. SYNC_REQ/SYNC_RES
  // (key distribution) are p2p management — drop them on the group path.
  if (pdu.service !== SERVICE_DATA) {
    return { kind: 'dropped', reason: `non-data Data Secure service ${pdu.service}` };
  }

  // Anti-replay runs AFTER MAC verification — a forged frame can't advance the
  // window even if its declared sequence is higher than anything we've seen.
  if (antiReplay && !antiReplay.checkAndUpdate(ctx.src, pdu.sequence)) {
    return { kind: 'dropped', reason: `replay (src=0x${ctx.src.toString(16)} seq=${pdu.sequence})` };
  }

  // Re-parse the decrypted bytes as the real service APCI. Can throw on a
  // malformed inner payload — catch so handleSecuredCemi never throws.
  try {
    data.payload = decodeApci(pdu.plain);
  } catch (err) {
    return { kind: 'dropped', reason: `decrypted payload is not a valid APCI: ${(err as Error).message}` };
  }
  return { kind: 'decrypted' };
}
