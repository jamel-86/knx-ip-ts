// Mirrors backend/src/types.ts. Kept in sync by convention — change both sides.

export type TunnelState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting';

export interface TunnelDiagnostics {
  state: TunnelState;
  assignedAddress: string | null;
  gatewayIp: string;
  gatewayPort: number;
  transport: 'udp' | 'tcp';
  secure: boolean;
  sendQueueDepth: number;
  txTelegrams: number;
  rxTelegrams: number;
  heartbeatsOk: number;
  heartbeatsFailed: number;
  reconnects: number;
  lastFrameTs: number | null;
  lastTxTs: number | null;
  lastRxTs: number | null;
  lastHeartbeatOkTs: number | null;
  lastHeartbeatFailTs: number | null;
  lastReconnectTs: number | null;
  lastTunnelLostReason: string | null;
  connectedAtTs: number | null;
  uptimeMs: number;
  sinceLastFrameMs: number | null;
}

export interface EtsTunnelingUser {
  interfaceIndex: number;
  userId: number;
  password: string;
}

export interface EtsSecureInterface {
  individualAddress: string;
  ipAddress: string | null;
  name: string;
  deviceAuthenticationCode: string;
  deviceManagementPassword: string;
  tunnelingUsers: EtsTunnelingUser[];
}

export interface EtsInfo {
  projectName: string | null;
  entryCount: number;
  withDpt: number;
  unknownDpt: number;
  warnings: string[];
  secureInterfaces: EtsSecureInterface[];
}

export interface AddInterfaceBody {
  label?: string;
  gatewayIp: string;
  gatewayPort?: number;
  secure?: {
    userId: number;
    userPassword: string;
    deviceAuthPassword?: string;
  };
}

export interface InterfaceInfo {
  id: string;
  label: string;
  gatewayIp: string;
  gatewayPort: number;
  secure: boolean;
  state: TunnelState;
  assignedAddress: string | null;
  lastError: string | null;
  diagnostics: TunnelDiagnostics | null;
}

export interface DecodedTelegram {
  value: unknown;
  dpt: string;
  unit?: string;
  gaName?: string;
  description?: string;
}

export interface TelegramRecord {
  id: number;
  ts: number;
  interfaceId: string;
  interfaceLabel: string;
  direction: 'in' | 'out';
  cemi: string;
  source: string | null;
  destination: string | null;
  apci: string;
  raw: string;
  decoded?: DecodedTelegram;
}

export type ServerMsg =
  | { type: 'snapshot'; ets: EtsInfo; interfaces: InterfaceInfo[]; recent: TelegramRecord[] }
  | { type: 'ets'; ets: EtsInfo }
  | { type: 'interface'; iface: InterfaceInfo }
  | { type: 'interface-removed'; id: string }
  | { type: 'telegram'; record: TelegramRecord };
