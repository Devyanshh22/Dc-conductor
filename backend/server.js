const express = require('express');
const cors    = require('cors');

/* Initialise DB (runs schema migrations on first boot) */
require('./db');

const sessionsRouter    = require('./routes/sessions');
const tasksRouter       = require('./routes/tasks');
const machinesRouter    = require('./routes/machines');
const assignmentsRouter = require('./routes/assignments');
const resultsRouter     = require('./routes/results');

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
app.use('/api/sessions', sessionsRouter);
app.use('/api/sessions', tasksRouter);
app.use('/api/sessions', machinesRouter);
app.use('/api/sessions', assignmentsRouter);
app.use('/api/sessions', resultsRouter);

/* ── 404 handler ────────────────────────────────────────────────────── */
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

/* ── Error handler ──────────────────────────────────────────────────── */
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: err.message ?? 'Internal server error' });
});

/* ── Start ──────────────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`Conductor backend running on http://localhost:${PORT}`);
});
