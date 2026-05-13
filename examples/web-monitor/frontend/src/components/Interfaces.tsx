import { useEffect, useState } from 'react';
import {
  addInterface,
  connectInterface,
  disconnectInterface,
  removeInterface,
} from '../api';
import type {
  AddInterfaceBody,
  EtsSecureInterface,
  InterfaceInfo,
} from '../types';

interface Props {
  interfaces: InterfaceInfo[];
  secureInterfaces: EtsSecureInterface[];
}

const EMPTY: AddInterfaceBody = {
  label: '',
  gatewayIp: '',
  gatewayPort: 3671,
};

type UserKey = '' | 'mgmt' | `tun-${number}`;

function deviceLabel(d: EtsSecureInterface): string {
  const ip = d.ipAddress ? ` — ${d.ipAddress}` : '';
  const name = d.name ? ` (${d.name})` : '';
  return `${d.individualAddress}${name}${ip}`;
}

export function Interfaces({ interfaces, secureInterfaces }: Props) {
  const [form, setForm] = useState<AddInterfaceBody>(EMPTY);
  const [useSecure, setUseSecure] = useState(false);
  const [manual, setManual] = useState(false);
  const [deviceIdx, setDeviceIdx] = useState<number | null>(null);
  const [userKey, setUserKey] = useState<UserKey>('');
  const [userId, setUserId] = useState<number>(2);
  const [userPassword, setUserPassword] = useState('');
  const [deviceAuth, setDeviceAuth] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const haveEtsSecure = secureInterfaces.length > 0;
  const usingDropdowns = useSecure && haveEtsSecure && !manual;
  const selectedDevice =
    deviceIdx !== null ? secureInterfaces[deviceIdx] ?? null : null;

  // When secure mode flips on and we have ETS data, auto-select the first
  // device. Re-runs if the ETS data appears later (project uploaded after
  // secure was already toggled on).
  useEffect(() => {
    if (!usingDropdowns) return;
    if (deviceIdx === null && secureInterfaces.length > 0) {
      setDeviceIdx(0);
    }
  }, [usingDropdowns, secureInterfaces.length, deviceIdx]);

  // Device change → prefill gateway IP + device auth, pick first user.
  useEffect(() => {
    if (!usingDropdowns) return;
    if (!selectedDevice) return;
    if (selectedDevice.ipAddress) {
      setForm((f) => ({ ...f, gatewayIp: selectedDevice.ipAddress as string }));
    }
    setDeviceAuth(selectedDevice.deviceAuthenticationCode);
    const firstTun = selectedDevice.tunnelingUsers[0];
    if (firstTun) {
      setUserKey(`tun-${firstTun.userId}`);
      setUserId(firstTun.userId);
      setUserPassword(firstTun.password);
    } else {
      setUserKey('mgmt');
      setUserId(1);
      setUserPassword(selectedDevice.deviceManagementPassword);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceIdx, usingDropdowns]);

  const onUserKeyChange = (key: string) => {
    setUserKey(key as UserKey);
    if (!selectedDevice) return;
    if (key === 'mgmt') {
      setUserId(1);
      setUserPassword(selectedDevice.deviceManagementPassword);
    } else if (key.startsWith('tun-')) {
      const id = Number(key.slice(4));
      const u = selectedDevice.tunnelingUsers.find((x) => x.userId === id);
      if (u) {
        setUserId(id);
        setUserPassword(u.password);
      }
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.gatewayIp.trim()) {
      setError('Gateway IP is required.');
      return;
    }
    if (useSecure && (!userPassword.trim() || !Number.isFinite(userId))) {
      setError('Secure mode needs a user id and user password.');
      return;
    }
    setBusy(true);
    try {
      const body: AddInterfaceBody = {
        label: form.label?.trim() || undefined,
        gatewayIp: form.gatewayIp.trim(),
        gatewayPort: Number(form.gatewayPort) || 3671,
      };
      if (useSecure) {
        body.secure = {
          userId: Number(userId),
          userPassword,
          deviceAuthPassword: deviceAuth.trim() || undefined,
        };
      }
      await addInterface(body);
      setForm(EMPTY);
      setUserPassword('');
      setDeviceAuth('');
      setUseSecure(false);
      setManual(false);
      setDeviceIdx(null);
      setUserKey('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>KNX interfaces</h2>
        <span className="counter">{interfaces.length}</span>
      </div>

      {interfaces.length === 0 && (
        <div className="banner">No interfaces yet — add one below.</div>
      )}

      {interfaces.map((iface) => (
        <div className="iface" key={iface.id}>
          <div className="iface-head">
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="iface-title">{iface.label}</div>
              <div className="iface-meta">
                {iface.secure && <span className="chip secure-chip">SECURE</span>}
                {iface.gatewayIp}:{iface.gatewayPort}
                {iface.assignedAddress ? ` · ia ${iface.assignedAddress}` : ''}
                {iface.diagnostics
                  ? ` · rx ${iface.diagnostics.rxTelegrams} / tx ${iface.diagnostics.txTelegrams}`
                  : ''}
              </div>
            </div>
            <div className="iface-actions">
              <span className={`pill ${iface.state}`}>
                <span className="dot" /> {iface.state}
              </span>
              {iface.state === 'disconnected' ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    void connectInterface(iface.id).catch((err) =>
                      setError(err.message),
                    );
                  }}
                >
                  Connect
                </button>
              ) : (
                <button
                  type="button"
                  className="ghost"
                  disabled={
                    iface.state === 'connecting' || iface.state === 'disconnecting'
                  }
                  onClick={() => {
                    void disconnectInterface(iface.id).catch((err) =>
                      setError(err.message),
                    );
                  }}
                >
                  Disconnect
                </button>
              )}
              <button
                type="button"
                className="danger"
                onClick={() => {
                  void removeInterface(iface.id).catch((err) =>
                    setError(err.message),
                  );
                }}
              >
                Remove
              </button>
            </div>
          </div>
          {iface.lastError && <div className="iface-err">{iface.lastError}</div>}
        </div>
      ))}

      <h3>Add interface</h3>
      <form onSubmit={submit}>
        <div className="row">
          <label>
            Label (optional)
            <input
              value={form.label ?? ''}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="kitchen line"
              disabled={busy}
            />
          </label>
        </div>
        <div className="row">
          <label className="flex-1">
            Gateway IP
            <input
              value={form.gatewayIp}
              onChange={(e) => setForm({ ...form, gatewayIp: e.target.value })}
              placeholder="192.168.1.50"
              disabled={busy}
            />
          </label>
          <label style={{ flex: '0 0 90px' }}>
            Port
            <input
              type="number"
              value={form.gatewayPort ?? 3671}
              onChange={(e) =>
                setForm({ ...form, gatewayPort: Number(e.target.value) || 3671 })
              }
              disabled={busy}
            />
          </label>
        </div>

        <div className="row">
          <label className="inline">
            <input
              type="checkbox"
              checked={useSecure}
              onChange={(e) => setUseSecure(e.target.checked)}
              disabled={busy}
            />
            <span>KNX IP Secure (TCP)</span>
          </label>
        </div>

        {useSecure && (
          <>
            {!haveEtsSecure && (
              <div className="banner" style={{ marginTop: 6, fontSize: 11 }}>
                Upload a .knxproj with secure devices to pick credentials from a
                dropdown.
              </div>
            )}

            {usingDropdowns && (
              <>
                <div className="row">
                  <label className="flex-1">
                    Device
                    <select
                      value={deviceIdx ?? ''}
                      onChange={(e) => setDeviceIdx(Number(e.target.value))}
                      disabled={busy}
                    >
                      {secureInterfaces.map((d, i) => (
                        <option key={`${d.individualAddress}-${i}`} value={i}>
                          {deviceLabel(d)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="row">
                  <label className="flex-1">
                    User
                    <select
                      value={userKey}
                      onChange={(e) => onUserKeyChange(e.target.value)}
                      disabled={busy || !selectedDevice}
                    >
                      {selectedDevice && (
                        <option value="mgmt">
                          User 1 — Management (DeviceManagementPassword)
                        </option>
                      )}
                      {selectedDevice?.tunnelingUsers.map((u) => (
                        <option key={u.userId} value={`tun-${u.userId}`}>
                          User {u.userId} — Tunneling (BI-{u.interfaceIndex})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setManual(true)}
                    disabled={busy}
                  >
                    Override manually
                  </button>
                </div>
              </>
            )}

            {(!usingDropdowns || manual) && (
              <>
                {haveEtsSecure && manual && (
                  <div className="row">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setManual(false)}
                      disabled={busy}
                    >
                      ← Use project credentials
                    </button>
                  </div>
                )}
                <div className="row">
                  <label style={{ flex: '0 0 90px' }}>
                    User ID
                    <input
                      type="number"
                      min={1}
                      max={127}
                      value={userId}
                      onChange={(e) => setUserId(Number(e.target.value))}
                      disabled={busy}
                    />
                  </label>
                  <label className="flex-1">
                    User password
                    <input
                      type="password"
                      value={userPassword}
                      onChange={(e) => setUserPassword(e.target.value)}
                      disabled={busy}
                      autoComplete="off"
                    />
                  </label>
                </div>
                <div className="row">
                  <label>
                    Device auth code (optional)
                    <input
                      type="password"
                      value={deviceAuth}
                      onChange={(e) => setDeviceAuth(e.target.value)}
                      disabled={busy}
                      autoComplete="off"
                    />
                  </label>
                </div>
              </>
            )}
          </>
        )}

        <div className="row">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Connecting…' : 'Add interface'}
          </button>
        </div>
      </form>

      {error && <div className="banner err" style={{ marginTop: 8 }}>{error}</div>}
    </section>
  );
}
