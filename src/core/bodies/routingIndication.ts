// ROUTING_INDICATION (0x0530) — a cEMI frame multicast on the KNX/IP routing
// backbone (224.0.23.12:3671). The body is the raw cEMI with no extra fields.
//
// Used by KNX/IP routers to exchange group telegrams between sub-lines.

import { CouldNotParseKNXIP } from '../errors';
import { ServiceType } from '../serviceTypes';

export interface RoutingIndicationInit {
  /** Raw cEMI frame (message code + control + addresses + APDU). */
  cemi: Buffer;
}

export class RoutingIndication {
  static readonly SERVICE_TYPE = ServiceType.ROUTING_INDICATION;

  cemi: Buffer;

  constructor(init: RoutingIndicationInit) {
    this.cemi = Buffer.from(init.cemi);
  }

  calculatedLength(): number {
    return this.cemi.length;
  }

  static fromKnx(raw: Buffer, offset = 0): { body: RoutingIndication; bytesRead: number } {
    if (raw.length - offset < 1) throw new CouldNotParseKNXIP('ROUTING_INDICATION too short');
    // The cEMI fills the remainder of the frame (one frame per multicast datagram).
    const cemi = Buffer.from(raw.subarray(offset));
    return { body: new RoutingIndication({ cemi }), bytesRead: cemi.length };
  }

  toKnx(): Buffer {
    return Buffer.from(this.cemi);
  }
}
