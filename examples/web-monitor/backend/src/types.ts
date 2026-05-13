// Shared message shapes for the REST + WebSocket surface.
// Kept in one file so the frontend can copy this verbatim.

import type { TunnelState, TunnelDiagnostics } from '../../../../src/io/tunnel';

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
  // Plaintext credentials sourced from the .knxproj. This example backend is
  // localhost-only and the frontend uses them to populate the "add interface"
  // form. Do NOT expose this app on a public network without adding auth.
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
