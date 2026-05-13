// HTTP + WebSocket entry point. Loopback-only by default (no auth).

import http from 'node:http';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { WebSocketServer } from 'ws';
import {
  KnxprojBadPassword,
  KnxprojPasswordRequired,
} from '../../../../src/index';
import { AppState } from './state';
import type { AddInterfaceBody } from './types';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';

const state = new AppState();
const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 64 * 1024 * 1024 }, // .knxproj archives are small
});

// --- ETS ---

app.get('/api/ets', (_req, res) => {
  res.json(state.getEtsInfo());
});

app.post('/api/ets', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'file field is required' });
    return;
  }
  const password =
    typeof req.body?.password === 'string' && req.body.password.length > 0
      ? req.body.password
      : undefined;
  try {
    const info = state.loadKnxproj(req.file.buffer, password);
    res.json(info);
  } catch (err) {
    if (err instanceof KnxprojPasswordRequired) {
      res.status(401).json({ error: 'password-required', message: err.message });
      return;
    }
    if (err instanceof KnxprojBadPassword) {
      res.status(403).json({ error: 'bad-password', message: err.message });
      return;
    }
    res.status(400).json({ error: 'parse-failed', message: (err as Error).message });
  }
});

// --- Interfaces ---

app.get('/api/interfaces', (_req, res) => {
  res.json(state.listInterfaces());
});

app.post('/api/interfaces', async (req, res) => {
  const body = req.body as Partial<AddInterfaceBody> | undefined;
  if (!body || typeof body.gatewayIp !== 'string' || body.gatewayIp.length === 0) {
    res.status(400).json({ error: 'gatewayIp is required' });
    return;
  }
  if (body.secure) {
    if (
      typeof body.secure.userId !== 'number' ||
      typeof body.secure.userPassword !== 'string' ||
      body.secure.userPassword.length === 0
    ) {
      res
        .status(400)
        .json({ error: 'secure.userId (number) and secure.userPassword are required' });
      return;
    }
  }
  try {
    const info = await state.addInterface(body as AddInterfaceBody);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: 'add-failed', message: (err as Error).message });
  }
});

app.post('/api/interfaces/:id/connect', async (req, res) => {
  const info = await state.connectInterface(req.params.id);
  if (!info) {
    res.status(404).json({ error: 'not-found' });
    return;
  }
  res.json(info);
});

app.post('/api/interfaces/:id/disconnect', async (req, res) => {
  const info = await state.disconnectInterface(req.params.id);
  if (!info) {
    res.status(404).json({ error: 'not-found' });
    return;
  }
  res.json(info);
});

app.delete('/api/interfaces/:id', async (req, res) => {
  const ok = await state.removeInterface(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'not-found' });
    return;
  }
  res.json({ ok: true });
});

// --- WebSocket ---

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  state.subscribe(ws);
});

server.listen(PORT, HOST, () => {
  console.log(`web-monitor backend listening on http://${HOST}:${PORT}`);
  console.log(`websocket on ws://${HOST}:${PORT}/ws`);
});

const shutdown = async (signal: string) => {
  console.log(`\n${signal} received, shutting down…`);
  await state.dispose();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
