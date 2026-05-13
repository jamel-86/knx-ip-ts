// Tiny WebSocket helper with auto-reconnect. The server pushes a 'snapshot'
// message on every connection, so the client doesn't need to remember any
// state across reconnects.

import type { ServerMsg } from './types';

export type WsStatus = 'connecting' | 'open' | 'closed';

export interface WsHandle {
  close(): void;
}

export function openWs(
  onMessage: (msg: ServerMsg) => void,
  onStatus: (status: WsStatus) => void,
): WsHandle {
  let socket: WebSocket | null = null;
  let closed = false;
  let reconnectTimer: number | null = null;

  const connect = () => {
    if (closed) return;
    onStatus('connecting');
    const url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
    socket = new WebSocket(url);

    socket.onopen = () => onStatus('open');

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMsg;
        onMessage(msg);
      } catch (err) {
        console.error('bad ws message', err);
      }
    };

    const scheduleReconnect = () => {
      if (closed) return;
      onStatus('closed');
      if (reconnectTimer !== null) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 1500);
    };

    socket.onclose = scheduleReconnect;
    socket.onerror = () => socket?.close();
  };

  connect();

  return {
    close() {
      closed = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      socket?.close();
    },
  };
}
