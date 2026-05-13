import { useRef, useState } from 'react';
import { uploadKnxproj } from '../api';
import type { EtsInfo } from '../types';

interface Props {
  ets: EtsInfo | null;
  onLoaded: (info: EtsInfo) => void;
}

export function EtsUpload({ ets, onLoaded }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Choose a .knxproj file first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const info = await uploadKnxproj(file, password);
      onLoaded(info);
      if (fileRef.current) fileRef.current.value = '';
      setPassword('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>ETS project</h2>
        {ets && ets.entryCount > 0 && (
          <span className="counter">
            <strong>{ets.entryCount}</strong> GAs
          </span>
        )}
      </div>
      {ets && ets.entryCount > 0 ? (
        <div className="banner ok">
          <span className="name">{ets.projectName ?? '(unnamed project)'}</span>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)' }}>
            {ets.withDpt} with DPT · {ets.unknownDpt} unknown
          </div>
        </div>
      ) : (
        <div className="banner">No project loaded yet.</div>
      )}

      <form onSubmit={onSubmit} style={{ marginTop: 10 }}>
        <div className="row">
          <label>
            .knxproj file
            <input ref={fileRef} type="file" accept=".knxproj" disabled={busy} />
          </label>
        </div>
        <div className="row">
          <label>
            Password (optional)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              autoComplete="off"
            />
          </label>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Loading…' : 'Upload'}
          </button>
        </div>
      </form>

      {error && <div className="banner err" style={{ marginTop: 8 }}>{error}</div>}

      {ets && ets.warnings.length > 0 && (
        <details>
          <summary>{ets.warnings.length} parser warning(s)</summary>
          <div className="warnings">
            {ets.warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
