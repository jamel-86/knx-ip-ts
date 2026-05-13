import type { AddInterfaceBody, EtsInfo, InterfaceInfo } from './types';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.message || body?.error || JSON.stringify(body);
    } catch {
      detail = await res.text();
    }
    throw new Error(`${res.status} ${res.statusText}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export async function uploadKnxproj(file: File, password: string): Promise<EtsInfo> {
  const form = new FormData();
  form.append('file', file);
  if (password) form.append('password', password);
  const res = await fetch('/api/ets', { method: 'POST', body: form });
  return jsonOrThrow<EtsInfo>(res);
}

export async function addInterface(body: AddInterfaceBody): Promise<InterfaceInfo> {
  const res = await fetch('/api/interfaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return jsonOrThrow<InterfaceInfo>(res);
}

export async function connectInterface(id: string): Promise<InterfaceInfo> {
  const res = await fetch(`/api/interfaces/${encodeURIComponent(id)}/connect`, {
    method: 'POST',
  });
  return jsonOrThrow<InterfaceInfo>(res);
}

export async function disconnectInterface(id: string): Promise<InterfaceInfo> {
  const res = await fetch(`/api/interfaces/${encodeURIComponent(id)}/disconnect`, {
    method: 'POST',
  });
  return jsonOrThrow<InterfaceInfo>(res);
}

export async function removeInterface(id: string): Promise<void> {
  const res = await fetch(`/api/interfaces/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  await jsonOrThrow<{ ok: true }>(res);
}
