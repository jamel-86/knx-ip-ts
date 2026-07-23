// ROUTING_LOST_MESSAGE (0x0531) — a routing participant's receive queue
// overflowed and it dropped frames. Body:
//   [0] structure length (0x04)
//   [1] reserved (0x00)
//   [2..3] number of lost messages (uint16 BE)

import { CouldNotParseKNXIP } from '../errors';
import { ServiceType } from '../serviceTypes';

export interface RoutingLostMessageInit {
  structureLength?: number;
  reserved?: number;
  numberOfLostMessages?: number;
}

export class RoutingLostMessage {
  static readonly SERVICE_TYPE = ServiceType.ROUTING_LOST_MESSAGE;
  static readonly STRUCT_LENGTH = 0x04;

  structureLength: number;
  reserved: number;
  numberOfLostMessages: number;

  constructor(init: RoutingLostMessageInit = {}) {
    this.structureLength = init.structureLength ?? RoutingLostMessage.STRUCT_LENGTH;
    this.reserved = init.reserved ?? 0;
    this.numberOfLostMessages = init.numberOfLostMessages ?? 0;
  }

  calculatedLength(): number {
    return RoutingLostMessage.STRUCT_LENGTH;
  }

  static fromKnx(raw: Buffer, offset = 0): { body: RoutingLostMessage; bytesRead: number } {
    if (raw.length - offset < RoutingLostMessage.STRUCT_LENGTH) {
      throw new CouldNotParseKNXIP('ROUTING_LOST_MESSAGE too short');
    }
    const structureLength = raw[offset]!;
    const reserved = raw[offset + 1]!;
    const numberOfLostMessages = raw.readUInt16BE(offset + 2);
    return {
      body: new RoutingLostMessage({ structureLength, reserved, numberOfLostMessages }),
      bytesRead: RoutingLostMessage.STRUCT_LENGTH,
    };
  }

  toKnx(): Buffer {
    const out = Buffer.alloc(RoutingLostMessage.STRUCT_LENGTH);
    out[0] = this.structureLength;
    out[1] = this.reserved;
    out.writeUInt16BE(this.numberOfLostMessages & 0xffff, 2);
    return out;
  }
}
