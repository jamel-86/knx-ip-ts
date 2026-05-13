// In-memory backend state: the ETS map, the live TunnelClient instances,
// a bounded ring of recent telegrams, and the WebSocket subscriber set.

import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  ETSProjectMap,
  TunnelClient,
  parseKnxproj,
  type TunnelClientOptions,
  type TunnelState,
} from '../../../../src/index';
import { decodeCemi } from './decode';
import type {
  AddInterfaceBody,
  EtsInfo,
  InterfaceInfo,
  ServerMsg,
  TelegramRecord,
} from './types';

const RECENT_BUFFER_SIZE = 500;

class ManagedInterface {
  readonly id: string;
  label: string;
  readonly gatewayIp: string;
  readonly gatewayPort: number;
  readonly secure: boolean;
  readonly client: TunnelClient;
  state: TunnelState = 'disconnected';
  lastError: string | null = null;

  constructor(id: string, body: AddInterfaceBody, client: TunnelClient) {
    this.id = id;
    this.label = body.label?.trim() || `${body.gatewayIp}:${body.gatewayPort ?? 3671}`;
    this.gatewayIp = body.gatewayIp;
    this.gatewayPort = body.gatewayPort ?? 3671;
    this.secure = !!body.secure;
    this.client = client;
  }

  info(): InterfaceInfo {
    return {
      id: this.id,
      label: this.label,
      gatewayIp: this.gatewayIp,
      gatewayPort: this.gatewayPort,
      secure: this.secure,
      state: this.state,
      assignedAddress: this.client.assignedAddress?.toString() ?? null,
      lastError: this.lastError,
      diagnostics: this.client.getDiagnostics(),
    };
  }
}

export class AppState {
  readonly etsMap = new ETSProjectMap();
  private etsInfo: EtsInfo = {
    projectName: null,
    entryCount: 0,
    withDpt: 0,
    unknownDpt: 0,
    warnings: [],
    secureInterfaces: [],
  };

  private readonly interfaces = new Map<string, ManagedInterface>();
  private readonly recent: TelegramRecord[] = [];
  private readonly subscribers = new Set<WebSocket>();

  // --- ETS ---

  loadKnxproj(buffer: Buffer, password?: string): EtsInfo {
    // Parse directly so we keep `secureInterfaces` — ETSProjectMap.loadKnxproj
    // would discard them.
    const parsed = parseKnxproj(buffer, { password });
    const mapResult = this.etsMap.loadParsedEntries(parsed.groupAddresses);
    this.etsInfo = {
      projectName: parsed.projectName,
      entryCount: mapResult.entries,
      withDpt: mapResult.withDpt,
      unknownDpt: mapResult.unknownDpt.length,
      warnings: [...parsed.warnings, ...mapResult.warnings],
      secureInterfaces: parsed.secureInterfaces.map((s) => ({
        individualAddress: s.individualAddress,
        ipAddress: s.ipAddress,
        name: s.name,
        deviceAuthenticationCode: s.deviceAuthenticationCode,
        deviceManagementPassword: s.deviceManagementPassword,
        tunnelingUsers: s.tunnelingUsers.map((u) => ({
          interfaceIndex: u.interfaceIndex,
          userId: u.userId,
          password: u.password,
        })),
      })),
    };
    this.broadcast({ type: 'ets', ets: this.etsInfo });
    return this.etsInfo;
  }

  getEtsInfo(): EtsInfo {
    return this.etsInfo;
  }

  // --- Interfaces ---

  listInterfaces(): InterfaceInfo[] {
    return [...this.interfaces.values()].map((i) => i.info());
  }

  async addInterface(body: AddInterfaceBody): Promise<InterfaceInfo> {
    const id = randomUUID();
    const opts: TunnelClientOptions = {
      gatewayIp: body.gatewayIp,
      gatewayPort: body.gatewayPort ?? 3671,
      autoReconnect: true,
    };
    if (body.secure) {
      opts.secure = {
        userId: body.secure.userId,
        userPassword: body.secure.userPassword,
        deviceAuthPassword: body.secure.deviceAuthPassword,
      };
    }

    const client = new TunnelClient(opts);
    const managed = new ManagedInterface(id, body, client);
    this.interfaces.set(id, managed);

    client.on('state', (next) => {
      managed.state = next;
      this.broadcastInterface(managed);
    });

    client.on('cemi', (cemi) => {
      const record = decodeCemi(cemi, this.etsMap, managed.id, managed.label);
      if (record) this.recordTelegram(record);
    });

    client.on('warning', (err) => {
      managed.lastError = err.message;
      this.broadcastInterface(managed);
    });

    client.on('error', (err) => {
      managed.lastError = err.message;
      this.broadcastInterface(managed);
    });

    // Kick off connect in the background — surfacing state changes via the
    // 'state' event keeps the UI responsive while the handshake (especially
    // KNX Secure) is in flight.
    client.connect().catch((err) => {
      managed.lastError = err.message;
      this.broadcastInterface(managed);
    });

    this.broadcastInterface(managed);
    return managed.info();
  }

  async connectInterface(id: string): Promise<InterfaceInfo | null> {
    const managed = this.interfaces.get(id);
    if (!managed) return null;
    // connect() is a no-op when already connected, and rejects from any
    // non-disconnected state — let the caller see the error via lastError.
    if (managed.client.state !== 'disconnected') {
      return managed.info();
    }
    managed.lastError = null;
    this.broadcastInterface(managed);
    try {
      await managed.client.connect();
    } catch (err) {
      managed.lastError = (err as Error).message;
      this.broadcastInterface(managed);
    }
    return managed.info();
  }

  async disconnectInterface(id: string): Promise<InterfaceInfo | null> {
    const managed = this.interfaces.get(id);
    if (!managed) return null;
    if (managed.client.state === 'disconnected') {
      return managed.info();
    }
    try {
      await managed.client.disconnect();
    } catch (err) {
      managed.lastError = (err as Error).message;
      this.broadcastInterface(managed);
    }
    return managed.info();
  }

  async removeInterface(id: string): Promise<boolean> {
    const managed = this.interfaces.get(id);
    if (!managed) return false;
    this.interfaces.delete(id);
    try {
      await managed.client.disconnect();
    } catch {
      /* swallow — we're tearing down */
    }
    managed.client.removeAllListeners();
    this.broadcast({ type: 'interface-removed', id });
    return true;
  }

  async dispose(): Promise<void> {
    const ids = [...this.interfaces.keys()];
    await Promise.all(ids.map((id) => this.removeInterface(id)));
    for (const ws of this.subscribers) {
      try {
        ws.close();
      } catch {
        /* swallow */
      }
    }
    this.subscribers.clear();
  }

  // --- Telegram buffer ---

  recordTelegram(record: TelegramRecord): void {
    this.recent.push(record);
    if (this.recent.length > RECENT_BUFFER_SIZE) {
      this.recent.shift();
    }
    this.broadcast({ type: 'telegram', record });
  }

  // --- WebSocket subscribers ---

  subscribe(ws: WebSocket): void {
    this.subscribers.add(ws);
    const snapshot: ServerMsg = {
      type: 'snapshot',
      ets: this.etsInfo,
      interfaces: this.listInterfaces(),
      recent: this.recent.slice(-200),
    };
    this.safeSend(ws, snapshot);

    ws.on('close', () => this.subscribers.delete(ws));
    ws.on('error', () => this.subscribers.delete(ws));
  }

  private broadcast(msg: ServerMsg): void {
    for (const ws of this.subscribers) this.safeSend(ws, msg);
  }

  private broadcastInterface(managed: ManagedInterface): void {
    this.broadcast({ type: 'interface', iface: managed.info() });
  }

  private safeSend(ws: WebSocket, msg: ServerMsg): void {
    if (ws.readyState !== ws.OPEN) return;
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* drop — close handler will clean up */
    }
  }
}
