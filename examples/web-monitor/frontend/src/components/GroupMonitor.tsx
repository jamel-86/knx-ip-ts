import { useEffect, useMemo, useRef, useState } from 'react';
import type { TelegramRecord } from '../types';

interface Props {
  records: TelegramRecord[];
  onClear: () => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

function ApciChip({ apci }: { apci: string }) {
  let kind = 'unknown';
  let label = apci;
  if (apci === 'GroupValueWrite') {
    kind = 'write';
    label = 'WRITE';
  } else if (apci === 'GroupValueResponse') {
    kind = 'response';
    label = 'RESP';
  } else if (apci === 'GroupValueRead') {
    kind = 'read';
    label = 'READ';
  }
  return <span className={`chip ${kind}`}>{label}</span>;
}

function ValueCell({ record }: { record: TelegramRecord }) {
  const d = record.decoded;
  if (!d) {
    return record.raw ? <span className="value raw">0x{record.raw}</span> : <span />;
  }
  const v = d.value;
  let text: string;
  if (typeof v === 'boolean') text = v ? 'true' : 'false';
  else if (typeof v === 'number') text = String(v);
  else if (typeof v === 'string') text = v;
  else if (v === null || v === undefined) text = '—';
  else text = JSON.stringify(v);
  return (
    <span className="value">
      {text}
      {d.unit && <span className="unit">{d.unit}</span>}
    </span>
  );
}

export function GroupMonitor({ records, onClear }: Props) {
  const [filter, setFilter] = useState('');
  const [autoscroll, setAutoscroll] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!filter.trim()) return records;
    const q = filter.toLowerCase();
    return records.filter((r) => {
      return (
        r.source?.toLowerCase().includes(q) ||
        r.destination?.toLowerCase().includes(q) ||
        r.decoded?.gaName?.toLowerCase().includes(q) ||
        r.apci.toLowerCase().includes(q) ||
        r.interfaceLabel.toLowerCase().includes(q)
      );
    });
  }, [records, filter]);

  useEffect(() => {
    if (!autoscroll || !bodyRef.current) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [filtered, autoscroll]);

  return (
    <section className="monitor">
      <div className="monitor-card">
        <div className="monitor-head">
          <h2>Group monitor</h2>
          <div className="monitor-tools">
            <input
              type="search"
              placeholder="filter by GA, name, source…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ width: 240 }}
            />
            <label className="inline">
              <input
                type="checkbox"
                checked={autoscroll}
                onChange={(e) => setAutoscroll(e.target.checked)}
              />
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>auto-scroll</span>
            </label>
            <span className="counter">
              <strong>{filtered.length}</strong> / {records.length}
            </span>
            <button className="ghost" onClick={onClear} disabled={records.length === 0}>
              Clear
            </button>
          </div>
        </div>

        <div className="monitor-body" ref={bodyRef}>
          {filtered.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">⤵</div>
              {records.length === 0 ? (
                <>
                  <strong>Waiting for telegrams</strong>
                  Add a KNX interface and connect it to see live group traffic.
                </>
              ) : (
                <>
                  <strong>No matches</strong>
                  Nothing matches the current filter.
                </>
              )}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Dir</th>
                  <th>Source</th>
                  <th>Destination</th>
                  <th>Name</th>
                  <th>APCI</th>
                  <th>Value</th>
                  <th>DPT</th>
                  <th>Iface</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="time">{formatTime(r.ts)}</td>
                    <td>
                      <span className={`dir-badge ${r.direction}`}>
                        {r.direction === 'in' ? '↓' : '↑'}
                      </span>
                    </td>
                    <td className="src">{r.source ?? ''}</td>
                    <td className="dst">{r.destination ?? ''}</td>
                    <td className="ga-name" title={r.decoded?.gaName ?? ''}>
                      {r.decoded?.gaName ?? ''}
                    </td>
                    <td>
                      <ApciChip apci={r.apci} />
                    </td>
                    <td>
                      <ValueCell record={r} />
                    </td>
                    <td className="ga-name">{r.decoded?.dpt ?? ''}</td>
                    <td className="ga-name">{r.interfaceLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
