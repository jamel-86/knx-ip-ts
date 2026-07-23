// KNX/IP routing client (03_08_05). A multicast backbone participant: sends
// group telegrams as ROUTING_INDICATION and emits incoming cEMI frames on the
// 'cemi' event. Parallel to TunnelClient, but connectionless (no tunnel setup).
//
// Routing injects group telegrams as L_DATA_IND (not L_DATA_REQ) — the backbone
// treats them as already-on-the-bus indications, which every device accepts.
//
// Because multicast loopback is on, a RoutingClient receives its own sends; it
// drops them by matching the cEMI source individual address against `physAddr`.

import { EventEmitter } from 'node:events';
import { RoutingBusy, RoutingIndication, RoutingLostMessage } from '../core/bodies';
import {
  CEMIFlags,
  CEMIFrame,
  CEMILData,
  CEMIMessageCode,
  DEFAULT_OUTGOING_FLAGS,
} from '../core/cemi';
import { CouldNotParseCEMI } from '../core/errors';
import { type APDUValue, groupValueRead, groupValueWrite } from '../core/apci';
import { GroupAddress, type GroupAddressInput, IndividualAddress, type IndividualAddressInput } from '../core/address';
import { defaultTpci } from '../core/telegram';
import { KNXIPFrame } from '../core/knxipFrame';
import { DataSecureAntiReplay, type DataSecureKeyResolver, handleSecuredCemi } from '../secure/dataSecureKeys';
import { KNX_MULTICAST_GROUP, KNX_PORT } from './const';
import { MulticastTransport } from './multicastTransport';
import type { Transport } from './transport';
import type { SocketAddress } from './udpTransport';

export type RoutingClientState = 'idle' | 'connected' | 'disconnected';

export interface RoutingLogger {
  debug?(msg: string, meta?: unknown): void;
  info?(msg: string, meta?: unknown): void;
  warn?(msg: string, meta?: unknown): void;
  error?(msg: string, meta?: unknown): void;
}

export interface RoutingClientOptions {
  /** Source individual address used on the backbone. Required for routing. */
  physAddr: IndividualAddressInput;
  /** Local interface IP for the multicast membership. Default 0.0.0.0. */
  localIp?: string;
  /** Multicast group. Default 224.0.23.12. */
  multicastGroup?: string;
  /** Multicast port. Default 3671. */
  multicastPort?: number;
  /** Multicast TTL. Default 16. */
  ttl?: number;
  /** Drop our own looped-back frames (source === physAddr). Default true. */
  filterOwnEcho?: boolean;
  /** Pause sends for the window advertised by an inbound ROUTING_BUSY. Default true. */
  respectRoutingBusy?: boolean;
  /** Data Secure key resolver — when set, secured group/p2p cEMIs are decrypted transparently. */
  dataSecureKeys?: DataSecureKeyResolver;
  /** Data Secure anti-replay tracker. Default: a fresh per-instance tracker when `dataSecureKeys` is set. */
  dataSecureAntiReplay?: DataSecureAntiReplay;
  /** Logger sink. Defaults to no-op. */
  logger?: RoutingLogger;
}

export class RoutingClient extends EventEmitter {
  private readonly _physAddr: IndividualAddress;
  private readonly _group: string;
  private readonly _port: number;
  private readonly _localIp: string;
  private readonly _ttl: number;
  private readonly _filterOwnEcho: boolean;
  private readonly _respectBusy: boolean;
  private readonly _logger: RoutingLogger;
  private readonly _secureKeys: DataSecureKeyResolver | null;
  private readonly _secureReplay: DataSecureAntiReplay | null;

  private _transport: Transport | null = null;
  private readonly _transportFactory: () => Transport;
  private _state: RoutingClientState = 'idle';
  /** Sends are paused until this epoch-ms (ROUTING_BUSY backoff). */
  private _busyUntil = 0;

  constructor(opts: RoutingClientOptions, transportFactory?: () => Transport) {
    super();
    this._physAddr = new IndividualAddress(opts.physAddr);
    this._group = opts.multicastGroup ?? KNX_MULTICAST_GROUP;
    this._port = opts.multicastPort ?? KNX_PORT;
    this._localIp = opts.localIp ?? '0.0.0.0';
    this._ttl = opts.ttl ?? 16;
    this._filterOwnEcho = opts.filterOwnEcho ?? true;
    this._respectBusy = opts.respectRoutingBusy ?? true;
    this._logger = opts.logger ?? {};
    this._secureKeys = opts.dataSecureKeys ?? null;
    this._secureReplay = opts.dataSecureKeys ? (opts.dataSecureAntiReplay ?? new DataSecureAntiReplay()) : null;
    this._transportFactory =
      transportFactory ??
      (() =>
        new MulticastTransport({
          multicastGroup: this._group,
          multicastPort: this._port,
          localAddress: this._localIp,
          ttl: this._ttl,
        }));
  }

  get state(): RoutingClientState {
    return this._state;
  }

  /** Bind the multicast socket and join the routing group. */
  async connect(): Promise<void> {
    if (this._state !== 'idle') throw new Error(`RoutingClient.connect() in state ${this._state}`);
    const t = this._transportFactory();
    t.on('message', (frame, source) => this._onFrame(frame, source));
    t.on('raw', (_d, _s, err) =>
      this._logger.debug?.(`Non-KNX multicast datagram dropped: ${err.message}`),
    );
    t.on('error', (err) => this.emit('error', err));
    await t.bind();
    this._transport = t;
    this._setState('connected');
  }

  /** Leave the group and close the socket. Idempotent. */
  async disconnect(): Promise<void> {
    const t = this._transport;
    this._transport = null;
    if (this._state !== 'disconnected') this._setState('disconnected');
    if (!t) return;
    t.removeAllListeners();
    try {
      await t.close();
    } catch (err) {
      this._logger.debug?.(`RoutingClient transport close error: ${(err as Error).message}`);
    }
  }

  /** Send a GroupValue_Write. `value` from smallValue()/bytesValue(). */
  groupValueWrite(destination: GroupAddressInput, value: APDUValue): Promise<void> {
    return this._sendGroup(destination, groupValueWrite(value));
  }

  /** Send a GroupValue_Read; the response arrives on the 'cemi' event. */
  groupValueRead(destination: GroupAddressInput): Promise<void> {
    return this._sendGroup(destination, groupValueRead());
  }

  // ---------- internals ----------

  private async _sendGroup(
    destination: GroupAddressInput,
    payload: ReturnType<typeof groupValueWrite>,
  ): Promise<void> {
    if (this._state !== 'connected') throw new Error(`RoutingClient send while ${this._state}`);
    const t = this._transport;
    if (!t) throw new Error('RoutingClient has no transport');

    const dst = new GroupAddress(destination);
    const cemi = new CEMIFrame({
      code: CEMIMessageCode.L_DATA_IND,
      data: new CEMILData({
        flags:
          DEFAULT_OUTGOING_FLAGS | CEMIFlags.DESTINATION_GROUP_ADDRESS | CEMIFlags.PRIORITY_LOW,
        srcAddr: this._physAddr,
        dstAddr: dst,
        tpci: defaultTpci(dst),
        payload,
      }),
    });

    await this._awaitBusyWindow();
    const indication = new RoutingIndication({ cemi: cemi.toKnx() });
    await t.send(KNXIPFrame.fromBody(indication));
  }

  private _onFrame(frame: KNXIPFrame, _source: SocketAddress): void {
    const body = frame.body;
    if (body instanceof RoutingIndication) {
      let cemiFrame: CEMIFrame;
      try {
        cemiFrame = CEMIFrame.fromKnx(body.cemi).frame;
      } catch (err) {
        if (err instanceof CouldNotParseCEMI) {
          this._logger.debug?.(`Unparseable cEMI in ROUTING_INDICATION dropped`);
          return;
        }
        this.emit('error', err as Error);
        return;
      }
      const src = cemiFrame.data?.srcAddr;
      if (this._filterOwnEcho && src && src.equals(this._physAddr)) return; // own loopback
      if (this._secureKeys) {
        const r = handleSecuredCemi(cemiFrame, this._secureKeys, this._secureReplay);
        if (r.kind === 'dropped') {
          this.emit('warning', `Data Secure: ${r.reason}`);
          return;
        }
      }
      this.emit('cemi', cemiFrame);
      return;
    }
    if (body instanceof RoutingBusy) {
      if (this._respectBusy && body.waitTimeMs > 0) {
        const until = Date.now() + body.waitTimeMs;
        if (until > this._busyUntil) this._busyUntil = until;
      }
      this.emit('warning', `ROUTING_BUSY: pause ${body.waitTimeMs} ms (state ${body.deviceState})`);
      return;
    }
    if (body instanceof RoutingLostMessage) {
      this.emit('warning', `ROUTING_LOST_MESSAGE: ${body.numberOfLostMessages} frame(s) dropped`);
      return;
    }
  }

  private async _awaitBusyWindow(): Promise<void> {
    const ms = this._busyUntil - Date.now();
    if (ms > 0) await new Promise<void>((r) => setTimeout(r, ms));
  }

  private _setState(next: RoutingClientState): void {
    if (next === this._state) return;
    const prev = this._state;
    this._state = next;
    this.emit('state', next, prev);
  }
}
