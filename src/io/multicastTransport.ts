// Multicast UDP transport for KNX/IP routing (03_08_05). Joins the KNX routing
// multicast group (224.0.23.12:3671 by default), parses inbound KNX/IP frames,
// and sends by multicasting. Mirrors UdpTransport's event surface so a routing
// client sits on top the same way a tunnel client does.
//
// Notes:
//  - reuseAddr is ON so multiple routing participants (ETS, other instances)
//    on one host can each bind 3671.
//  - Multicast loopback is ON by default; a routing client MUST filter out the
//    cEMI frames it originated (match the source individual address) to avoid
//    echoing its own telegrams back into its own receive path.
//  - To RECEIVE routing frames you must bind to the multicast port (default
//    3671). Binding to an ephemeral port will not receive the multicast traffic.

import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { CouldNotParseKNXIP, IncompleteKNXIPFrame, UnsupportedKNXIPService } from '../core/errors';
import { KNXIPFrame } from '../core/knxipFrame';
import { KNX_MULTICAST_GROUP, KNX_PORT } from './const';

export interface SocketAddress {
  address: string;
  port: number;
}

export interface MulticastTransportOptions {
  /** Multicast group. Default 224.0.23.12. */
  multicastGroup?: string;
  /** Multicast port (also the bind port). Default 3671. */
  multicastPort?: number;
  /** Local interface IP for membership + bind. Default 0.0.0.0 (all interfaces). */
  localAddress?: string;
  /** Bind port override. Defaults to the multicast port. */
  localPort?: number;
  /** Multicast TTL (hops). Default 16 — keep traffic local. */
  ttl?: number;
  /** Deliver our own multicast sends back to us. Default true. */
  loopback?: boolean;
}

export class MulticastTransport extends EventEmitter {
  private readonly _opts: Required<MulticastTransportOptions>;
  private _socket: dgram.Socket | null = null;
  private _bound: SocketAddress | null = null;
  private _closed = false;

  constructor(opts: MulticastTransportOptions = {}) {
    super();
    this._opts = {
      multicastGroup: opts.multicastGroup ?? KNX_MULTICAST_GROUP,
      multicastPort: opts.multicastPort ?? KNX_PORT,
      localAddress: opts.localAddress ?? '0.0.0.0',
      localPort: opts.localPort ?? opts.multicastPort ?? KNX_PORT,
      ttl: opts.ttl ?? 16,
      loopback: opts.loopback ?? true,
    };
  }

  get bound(): SocketAddress | null {
    return this._bound;
  }
  get multicastGroup(): string {
    return this._opts.multicastGroup;
  }
  get multicastPort(): number {
    return this._opts.multicastPort;
  }

  /** Open the socket, bind, and join the multicast group. */
  bind(): Promise<SocketAddress> {
    if (this._socket) return Promise.reject(new Error('MulticastTransport already bound'));
    if (this._closed) return Promise.reject(new Error('MulticastTransport already closed'));

    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this._socket = socket;
    socket.on('error', (err) => this.emit('error', err));
    socket.on('message', (data, rinfo) => {
      const source: SocketAddress = { address: rinfo.address, port: rinfo.port };
      try {
        const { frame } = KNXIPFrame.fromKnx(data);
        this.emit('message', frame, source);
      } catch (err) {
        if (
          err instanceof CouldNotParseKNXIP ||
          err instanceof IncompleteKNXIPFrame ||
          err instanceof UnsupportedKNXIPService
        ) {
          this.emit('raw', data, source, err as Error);
          return;
        }
        this.emit('error', err as Error);
      }
    });
    socket.on('close', () => this.emit('close'));

    return new Promise<SocketAddress>((resolve, reject) => {
      const onError = (err: Error) => {
        socket.off('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        socket.off('error', onError);
        try {
          socket.setMulticastTTL(this._opts.ttl);
          socket.setMulticastLoopback(this._opts.loopback);
          socket.addMembership(this._opts.multicastGroup, this._opts.localAddress);
        } catch (err) {
          reject(err as Error);
          return;
        }
        const addr = socket.address();
        this._bound = { address: addr.address, port: addr.port };
        resolve(this._bound);
      };
      socket.once('listening', onListening);
      socket.once('error', onError);
      socket.bind({
        address: this._opts.localAddress,
        port: this._opts.localPort,
      });
    });
  }

  /** Multicast a frame to the group. `addr` override is ignored (always the group). */
  send(frame: KNXIPFrame, _addr?: SocketAddress): Promise<void> {
    if (this._closed) return Promise.reject(new Error('MulticastTransport is closed'));
    const socket = this._socket;
    if (!socket) return Promise.reject(new Error('MulticastTransport not bound'));
    const buf = frame.toKnx();
    return new Promise<void>((resolve, reject) => {
      socket.send(buf, this._opts.multicastPort, this._opts.multicastGroup, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /** Drop the membership and close. Idempotent. */
  close(): Promise<void> {
    if (this._closed) return Promise.resolve();
    this._closed = true;
    const socket = this._socket;
    if (!socket) return Promise.resolve();
    try {
      socket.dropMembership(this._opts.multicastGroup);
    } catch {
      /* ignore — socket may already be closing */
    }
    return new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.close();
    });
  }
}
