import { useEffect, useReducer, useState } from 'react';
import { EtsUpload } from './components/EtsUpload';
import { GroupMonitor } from './components/GroupMonitor';
import { Interfaces } from './components/Interfaces';
import type { EtsInfo, InterfaceInfo, ServerMsg, TelegramRecord } from './types';
import { openWs, type WsStatus } from './ws';

interface AppData {
  ets: EtsInfo | null;
  interfaces: InterfaceInfo[];
  records: TelegramRecord[];
}

const INITIAL: AppData = { ets: null, interfaces: [], records: [] };
const RECORD_CAP = 1000;

type Action =
  | { kind: 'snapshot'; ets: EtsInfo; interfaces: InterfaceInfo[]; recent: TelegramRecord[] }
  | { kind: 'ets'; ets: EtsInfo }
  | { kind: 'interface'; iface: InterfaceInfo }
  | { kind: 'interface-removed'; id: string }
  | { kind: 'telegram'; record: TelegramRecord }
  | { kind: 'clear-telegrams' };

function reduce(state: AppData, action: Action): AppData {
  switch (action.kind) {
    case 'snapshot':
      return {
        ets: action.ets,
        interfaces: action.interfaces,
        records: action.recent,
      };
    case 'ets':
      return { ...state, ets: action.ets };
    case 'interface': {
      const idx = state.interfaces.findIndex((i) => i.id === action.iface.id);
      const next = state.interfaces.slice();
      if (idx >= 0) next[idx] = action.iface;
      else next.push(action.iface);
      return { ...state, interfaces: next };
    }
    case 'interface-removed':
      return {
        ...state,
        interfaces: state.interfaces.filter((i) => i.id !== action.id),
      };
    case 'telegram': {
      const records = state.records.concat(action.record);
      if (records.length > RECORD_CAP) records.splice(0, records.length - RECORD_CAP);
      return { ...state, records };
    }
    case 'clear-telegrams':
      return { ...state, records: [] };
  }
}

function wsLabel(s: WsStatus): string {
  return s === 'open' ? 'live' : s;
}

export function App() {
  const [data, dispatch] = useReducer(reduce, INITIAL);
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');

  useEffect(() => {
    const handle = openWs(
      (msg: ServerMsg) => {
        switch (msg.type) {
          case 'snapshot':
            dispatch({
              kind: 'snapshot',
              ets: msg.ets,
              interfaces: msg.interfaces,
              recent: msg.recent,
            });
            break;
          case 'ets':
            dispatch({ kind: 'ets', ets: msg.ets });
            break;
          case 'interface':
            dispatch({ kind: 'interface', iface: msg.iface });
            break;
          case 'interface-removed':
            dispatch({ kind: 'interface-removed', id: msg.id });
            break;
          case 'telegram':
            dispatch({ kind: 'telegram', record: msg.record });
            break;
        }
      },
      setWsStatus,
    );
    return () => handle.close();
  }, []);

  const connectedCount = data.interfaces.filter((i) => i.state === 'connected').length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-logo">K</div>
          <span>KNX/IP web monitor</span>
          <span className="brand-sub">knx-ts</span>
        </div>
        <div className="topbar-meta">
          {data.ets?.projectName && (
            <span>
              project <strong>{data.ets.projectName}</strong>
            </span>
          )}
          {data.ets && data.ets.entryCount > 0 && (
            <span>
              <strong>{data.ets.entryCount}</strong> GAs
            </span>
          )}
          <span>
            <strong>{connectedCount}</strong> / {data.interfaces.length} connected
          </span>
          <span className={`pill ws-${wsStatus}`}>
            <span className="dot" /> {wsLabel(wsStatus)}
          </span>
        </div>
      </header>

      <div className="body">
        <aside className="sidebar">
          <EtsUpload ets={data.ets} onLoaded={(ets) => dispatch({ kind: 'ets', ets })} />
          <Interfaces
            interfaces={data.interfaces}
            secureInterfaces={data.ets?.secureInterfaces ?? []}
          />
        </aside>
        <main>
          <GroupMonitor
            records={data.records}
            onClear={() => dispatch({ kind: 'clear-telegrams' })}
          />
        </main>
      </div>
    </div>
  );
}
