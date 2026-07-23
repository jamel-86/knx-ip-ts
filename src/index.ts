// Public API for @jamel-knx/knx-ts.
//
// A pure-TypeScript KNX/IP client library: UDP tunnelling, KNX IP Secure
// tunnelling over TCP, gateway discovery, DPT codecs, and ETS .knxproj parsing.
//
// SPDX-License-Identifier: MIT

// ---------------------------------------------------------------------------
// Tunnel client (the headline API)
// ---------------------------------------------------------------------------
export {
  CommunicationError,
  TunnelClient,
  TunnellingAckError,
  type SecureTunnelOptions,
  type TunnelClientEvents,
  type TunnelClientOptions,
  type TunnelDiagnostics,
  type TunnelLogger,
  type TunnelState,
} from './io/tunnel';

// ---------------------------------------------------------------------------
// Gateway discovery
// ---------------------------------------------------------------------------
export {
  discoverGateways,
  type DiscoveredGateway,
  type DiscoveryOptions,
} from './io/discovery';

// ---------------------------------------------------------------------------
// Routing client (multicast backbone)
// ---------------------------------------------------------------------------
export {
  RoutingClient,
  type RoutingClientOptions,
  type RoutingClientState,
  type RoutingLogger,
} from './io/routingClient';

// ---------------------------------------------------------------------------
// Transports (advanced — most users go through TunnelClient / RoutingClient)
// ---------------------------------------------------------------------------
export type { Transport } from './io/transport';
export {
  UdpTransport,
  type SocketAddress,
  type UdpTransportOptions,
  type UdpTransportEvents,
} from './io/udpTransport';
export {
  MulticastTransport,
  type MulticastTransportOptions,
} from './io/multicastTransport';
export {
  TcpTransport,
  type TcpTransportOptions,
  type TcpTransportEvents,
} from './io/tcpTransport';
export {
  SecureSession,
  type InnerTransport,
  type SecureSessionOptions,
  type SecureSessionState,
} from './io/secureSession';
export { SerialQueue } from './io/serialQueue';
export {
  AUTO_RECONNECT_WAIT_MS,
  CONNECT_REQUEST_TIMEOUT_MS,
  CONNECTIONSTATE_REQUEST_TIMEOUT_MS,
  CONNECTION_ALIVE_TIME_MS,
  DEFAULT_INDIVIDUAL_ADDRESS,
  HEARTBEAT_MAX_FAILURES,
  HEARTBEAT_RATE_MS,
  KNX_MULTICAST_GROUP,
  KNX_PORT,
  TUNNELLING_REQUEST_TIMEOUT_MS,
} from './io/const';

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------
export {
  CouldNotParseAddress,
  GroupAddress,
  IndividualAddress,
  type GroupAddressInput,
  type GroupAddressStyle,
  type IndividualAddressInput,
} from './core/address';
export {
  compileGAPattern,
  compileGAPatterns,
  type GAMatcher,
} from './core/gaMatcher';

// ---------------------------------------------------------------------------
// Frame / protocol primitives
// ---------------------------------------------------------------------------
export { KNXIPFrame } from './core/knxipFrame';
export { KNXIPHeader } from './core/knxipHeader';
export { HPAI } from './core/hpai';
export { CRI, CRD, type CRIInit, type CRDInit } from './core/cri';
export {
  ConnectionType,
  ErrorCode,
  HEADER_SIZE_10,
  HostProtocol,
  KNXNETIP_VERSION_10,
  KNX_ROUTING_MULTICAST,
  ServiceType,
  TunnellingLayer,
  errorCodeName,
  serviceTypeName,
} from './core/serviceTypes';
export {
  CEMIFlags,
  CEMIFrame,
  CEMILData,
  CEMIMessageCode,
  DEFAULT_OUTGOING_FLAGS,
  cemiMessageCodeName,
  type CEMIFrameInit,
  type CEMILDataInit,
} from './core/cemi';
export {
  APCIService,
  apciNpduLength,
  bytesValue,
  decodeApci,
  encodeApci,
  groupValueRead,
  groupValueResponse,
  groupValueWrite,
  smallValue,
  type APCI,
  type APDUValue,
} from './core/apci';
export {
  encodeTpci,
  isControlTpci,
  resolveTpci,
  tAck,
  tConnect,
  tDataBroadcast,
  tDataConnected,
  tDataGroup,
  tDataIndividual,
  tDataTagGroup,
  tDisconnect,
  tNak,
  type TPCI,
} from './core/tpci';
export {
  defaultTpci,
  telegramFromGroupRead,
  telegramFromGroupResponse,
  telegramFromGroupWrite,
  type Telegram,
  type TelegramDirection,
} from './core/telegram';
export {
  ConversionError,
  CouldNotParseCEMI,
  CouldNotParseKNXIP,
  IncompleteKNXIPFrame,
  UnsupportedKNXIPService,
} from './core/errors';

// ---------------------------------------------------------------------------
// KNX/IP body messages
// ---------------------------------------------------------------------------
export * from './core/bodies';

// ---------------------------------------------------------------------------
// DPT registry — importing this module also registers every bundled codec
// ---------------------------------------------------------------------------
export {
  getDpt,
  hasDpt,
  listDpts,
  registerDpt,
  type DPTCodec,
} from './dpt';

// ---------------------------------------------------------------------------
// ETS project parsing (.knxproj)
// ---------------------------------------------------------------------------
export {
  KnxprojAesNotSupported,
  KnxprojBadPassword,
  KnxprojPasswordRequired,
  parseKnxproj,
  type KnxprojGroupAddress,
  type KnxprojParseResult,
  type KnxprojSecureInterface,
  type ParseKnxprojOptions,
} from './ets/knxproj';
export {
  ETSProjectMap,
  type ETSEntry,
  type ETSLoadResult,
} from './ets/projectMap';
export {
  normalizeDptId,
  type NormalizedDpt,
} from './ets/dptNormalize';
export {
  parseEtsCsv,
  type ParseResult as EtsCsvParseResult,
  type ParsedRow as EtsCsvParsedRow,
} from './ets/csvParser';

// ---------------------------------------------------------------------------
// KNX IP Secure primitives
// ---------------------------------------------------------------------------
export {
  deriveDeviceAuthCode,
  deriveSessionKey,
  deriveUserPasswordKey,
} from './secure/keys';
export {
  decryptSecureWrapper,
  encryptSecureWrapper,
  type DecryptWrapperInput,
  type EncryptWrapperInput,
  type EncryptWrapperOutput,
} from './secure/wrapper';
export {
  aesCbcMac,
  aesCcmDecrypt,
  aesCcmEncrypt,
  aesCmac,
  aesCtrXor,
  aesEncryptBlock,
  bytesXor,
  generateX25519KeyPair,
  pbkdf2,
  sha256,
  x25519SharedSecret,
  type CcmDecryptInput,
  type CcmEncryptInput,
  type CcmEncryptOutput,
  type Pbkdf2Input,
  type X25519KeyPair,
} from './secure/crypto';
export {
  computeAuthenticateMac,
  computeSessionResponseMac,
  COUNTER_0_HANDSHAKE,
} from './secure/handshake';

// ---------------------------------------------------------------------------
// KNX Data Secure (group / p2p telegram decryption)
// ---------------------------------------------------------------------------
export {
  decodeDataSecure,
  encodeDataSecure,
  isDataSecureApdu,
  APCI_DATA_SECURE,
  SERVICE_DATA,
  SERVICE_SYNC_REQ,
  SERVICE_SYNC_RES,
  SCF_TOOL_ACCESS,
  SCF_AUTH_CONF,
  SCF_SYSTEM_BCAST,
  type DataSecureDecodeInput,
  type DataSecureEncodeInput,
  type DataSecurePdu,
} from './secure/dataSecure';
export {
  DataSecureAntiReplay,
  InMemoryDataSecureKeys,
  handleSecuredCemi,
  type DataSecureKeyContext,
  type DataSecureKeyResolver,
} from './secure/dataSecureKeys';

// ---------------------------------------------------------------------------
// In-memory bus monitor (optional helper for observability)
// ---------------------------------------------------------------------------
export {
  BusMonitor,
  DEFAULT_BUFFER_SIZE,
  busMonitor as defaultBusMonitor,
  type TelegramDecoded,
  type TelegramRecord,
} from './runtime/busMonitor';

// ---------------------------------------------------------------------------
// Generic utilities
// ---------------------------------------------------------------------------
export { compileCron, type CronMatcher } from './util/cron';
export {
  interpolateString,
  renderJsonTemplate,
  renderJsonValue,
  type RenderResult,
  type TemplateCtx,
} from './util/template';
