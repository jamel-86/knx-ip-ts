// ROUTING_BUSY (0x0532) — flow control. A routing participant sends this to
// make peers back off for `waitTimeMs`. Receivers MUST suspend outgoing
// ROUTING_INDICATIONs for that window. Body:
//   [0] structure length (0x06)
//   [1] device state
//   [2..3] wait time (uint16 BE, milliseconds)
//   [4..5] control field (uint16 BE; reserved/extension by the sender)

import { CouldNotParseKNXIP } from '../errors';
import { ServiceType } from '../serviceTypes';

export interface RoutingBusyInit {
  structureLength?: number;
  deviceState?: number;
  waitTimeMs?: number;
  controlField?: number;
}

export class RoutingBusy {
  static readonly SERVICE_TYPE = ServiceType.ROUTING_BUSY;
  static readonly STRUCT_LENGTH = 0x06;

  structureLength: number;
  deviceState: number;
  /** Milliseconds peers should pause sending. */
  waitTimeMs: number;
  controlField: number;

  constructor(init: RoutingBusyInit = {}) {
    this.structureLength = init.structureLength ?? RoutingBusy.STRUCT_LENGTH;
    this.deviceState = init.deviceState ?? 0;
    this.waitTimeMs = init.waitTimeMs ?? 0;
    this.controlField = init.controlField ?? 0;
  }

  calculatedLength(): number {
    return RoutingBusy.STRUCT_LENGTH;
  }

  static fromKnx(raw: Buffer, offset = 0): { body: RoutingBusy; bytesRead: number } {
    if (raw.length - offset < RoutingBusy.STRUCT_LENGTH) {
      throw new CouldNotParseKNXIP('ROUTING_BUSY too short');
    }
    const structureLength = raw[offset]!;
    const deviceState = raw[offset + 1]!;
    const waitTimeMs = raw.readUInt16BE(offset + 2);
    const controlField = raw.readUInt16BE(offset + 4);
    return {
      body: new RoutingBusy({ structureLength, deviceState, waitTimeMs, controlField }),
      bytesRead: RoutingBusy.STRUCT_LENGTH,
    };
  }

  toKnx(): Buffer {
    const out = Buffer.alloc(RoutingBusy.STRUCT_LENGTH);
    out[0] = this.structureLength;
    out[1] = this.deviceState;
    out.writeUInt16BE(this.waitTimeMs & 0xffff, 2);
    out.writeUInt16BE(this.controlField & 0xffff, 4);
    return out;
  }
}
