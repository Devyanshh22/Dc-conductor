'use strict';

const http       = require('http');
const express    = require('express');
const cors       = require('cors');
const WebSocket  = require('ws');

/* Initialise DB (runs schema migrations on first boot) */
require('./db');

const sessionsRouter    = require('./routes/sessions');
const tasksRouter       = require('./routes/tasks');
const machinesRouter    = require('./routes/machines');
const assignmentsRouter = require('./routes/assignments');
const resultsRouter     = require('./routes/results');
const executionRouter   = require('./routes/execution');

const pool = require('./workerPool');

const app  = express();
const PORT = 3001;

/* ── Middleware ─────────────────────────────────────────────────────── */
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

/* Request logger */
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

/* ── Routes ─────────────────────────────────────────────────────────── */
app.use('/api/sessions',  sessionsRouter);
app.use('/api/sessions',  tasksRouter);
app.use('/api/sessions',  machinesRouter);
app.use('/api/sessions',  assignmentsRouter);
app.use('/api/sessions',  resultsRouter);
app.use('/api/execution', executionRouter);

/* ── 404 handler ────────────────────────────────────────────────────── */
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

/* ── Error handler ──────────────────────────────────────────────────── */
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: err.message ?? 'Internal server error' });
});

/* ── HTTP server (wraps Express so WebSocket can share the same port) ── */
const server = http.createServer(app);

/* ── WebSocket server ───────────────────────────────────────────────── */
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

/* ── Wire worker-pool events → WebSocket broadcast ─────────────────── */

pool.onProgress((msg) => {
  broadcast({
    type:      'task_progress',
    taskId:    msg.taskId,
    machineId: msg.machineId,
    percent:   msg.percent,
    metric:    msg.metric,
    elapsed:   msg.elapsed,
  });
});

pool.onComplete((msg) => {
  broadcast({
    type:           'task_complete',
    taskId:         msg.taskId,
    machineId:      msg.machineId,
    actualDuration: msg.actualDuration,
  });
});

pool.onAllDone((summary) => {
  console.log(`[Pool] All tasks complete. Wall-clock: ${summary.totalDuration}s`);
  broadcast({
    type:          'execution_complete',
    totalDuration: summary.totalDuration,
    summary:       summary.summary,
  });
});

/* ── Start ──────────────────────────────────────────────────────────── */
pool.initPool()
  .then(() => {
    console.log('[Pool] All 5 worker threads online');
    server.listen(PORT, () => {
      console.log(`Conductor backend running on http://localhost:${PORT}`);
      console.log(`WebSocket server listening on ws://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[Pool] Failed to initialise worker pool:', err);
    process.exit(1);
  });
