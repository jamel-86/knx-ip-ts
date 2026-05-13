// cEMI frame → TelegramRecord. Looks up GA name + DPT from the ETSProjectMap
// and runs the registered DPT codec when one applies. Falls back to raw hex
// for unknown DPTs and non-group telegrams.

import {
  CEMIFrame,
  CEMIMessageCode,
  GroupAddress,
  cemiMessageCodeName,
  encodeApci,
  ETSProjectMap,
  getDpt,
  hasDpt,
} from '../../../../src/index';
import type { DecodedTelegram, TelegramRecord } from './types';

let nextId = 1;

export function decodeCemi(
  cemi: CEMIFrame,
  etsMap: ETSProjectMap,
  interfaceId: string,
  interfaceLabel: string,
): TelegramRecord | null {
  // We surface L_DATA.ind (received) and L_DATA.con (confirmation of our own
  // L_DATA.req). The L_DATA.req we send is mirrored back as L_DATA.con — that
  // pair is what gives the operator a real "out" line on the monitor.
  const code = cemi.code;
  if (
    code !== CEMIMessageCode.L_DATA_IND &&
    code !== CEMIMessageCode.L_DATA_CON
  ) {
    return null;
  }

  const data = cemi.data;
  const direction: 'in' | 'out' = code === CEMIMessageCode.L_DATA_CON ? 'out' : 'in';
  const source = data.srcAddr.toString();
  const destination = data.dstAddr.toString();
  const isGroup = data.dstAddr instanceof GroupAddress;

  const apciKind = data.payload?.kind ?? 'Control';
  const rawHex = data.payload ? encodeApci(data.payload).toString('hex') : '';

  let decoded: DecodedTelegram | undefined;
  if (
    isGroup &&
    (data.payload?.kind === 'GroupValueWrite' ||
      data.payload?.kind === 'GroupValueResponse')
  ) {
    const entry = etsMap.get(data.dstAddr as GroupAddress);
    if (entry?.dpt && hasDpt(entry.dpt)) {
      try {
        const codec = getDpt(entry.dpt);
        const value = codec.decode(data.payload.data);
        decoded = {
          value: serialiseValue(value),
          dpt: entry.dpt,
          unit: codec.unit,
          gaName: entry.name || undefined,
          description: entry.description || undefined,
        };
      } catch (err) {
        decoded = {
          value: `decode error: ${(err as Error).message}`,
          dpt: entry.dpt,
          gaName: entry.name || undefined,
        };
      }
    } else if (entry) {
      decoded = {
        value: null,
        dpt: entry.dptRaw ?? '?',
        gaName: entry.name || undefined,
        description: entry.description || undefined,
      };
    }
  }

  return {
    id: nextId++,
    ts: Date.now(),
    interfaceId,
    interfaceLabel,
    direction,
    cemi: cemiMessageCodeName(code),
    source,
    destination,
    apci: apciKind,
    raw: rawHex,
    decoded,
  };
}

// Buffers, dates, etc. — render them as something JSON.stringify won't blow up on.
function serialiseValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Buffer.isBuffer(value)) return value.toString('hex');
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialiseValue);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialiseValue(v);
    return out;
  }
  return value;
}
