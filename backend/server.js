'use strict';

const http      = require('http');
const express   = require('express');
const cors      = require('cors');
const WebSocket = require('ws');

/* Initialise DB (runs schema migrations on first boot) */
require('./db');

const sessionsRouter    = require('./routes/sessions');
const tasksRouter       = require('./routes/tasks');
const machinesRouter    = require('./routes/machines');
const assignmentsRouter = require('./routes/assignments');
const resultsRouter     = require('./routes/results');

/* execution module exports { router, setBroadcast } */
const { router: executionRouter, setBroadcast } = require('./routes/execution');

const registry = require('./workerPool');

const app  = express();
const PORT = 3001;

/* ── Middleware ─────────────────────────────────────────────────────────── */
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'] }));
app.use(express.json({ limit: '100mb' }));   /* images can be large */

/* Request logger */
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

/* ── Routes ─────────────────────────────────────────────────────────────── */
app.use('/api/sessions',  sessionsRouter);
app.use('/api/sessions',  tasksRouter);
app.use('/api/sessions',  machinesRouter);
app.use('/api/sessions',  assignmentsRouter);
app.use('/api/sessions',  resultsRouter);
app.use('/api/execution', executionRouter);

/* ── 404 ────────────────────────────────────────────────────────────────── */
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

/* ── Error handler ──────────────────────────────────────────────────────── */
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: err.message ?? 'Internal server error' });
});

/* ── HTTP server ────────────────────────────────────────────────────────── */
const server = http.createServer(app);

/* ── WebSocket server ───────────────────────────────────────────────────── */
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  ws.on('close', () => console.log('[WS] Client disconnected'));
  ws.on('error', (err) => console.warn('[WS] Socket error:', err.message));
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

/* Wire broadcast function into the execution route module */
setBroadcast(broadcast);

/* ── Start ──────────────────────────────────────────────────────────────── */
registry.initRegistry()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Conductor backend running on http://localhost:${PORT}`);
      console.log(`WebSocket server listening on ws://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[Registry] initRegistry error:', err.message);
    /* Start anyway — offline workers will be re-checked by the poll loop */
    server.listen(PORT, () => {
      console.log(`Conductor backend running on http://localhost:${PORT} (some workers may be offline)`);
    });
  });
