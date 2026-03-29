'use strict';

/**
 * worker.js — Standalone worker HTTP service.
 *
 * Each container instance represents one virtual machine node.
 * Configured via environment variables:
 *   MACHINE_ID   e.g. "Node-Alpha"
 *   MACHINE_PORT e.g. 4001
 *   CPU_CORES    e.g. 16
 *   RAM_GB       e.g. 64
 *
 * Endpoints:
 *   GET  /status       — health + current status
 *   POST /task/math    — evaluate an equation over an x range
 *   POST /task/image   — convert an image strip to grayscale
 */

const express    = require('express');
const cors       = require('cors');
const { evaluate } = require('mathjs');
const sharp      = require('sharp');

/* ── Config ─────────────────────────────────────────────────────────────── */
const MACHINE_ID   = process.env.MACHINE_ID   || 'Node-Unknown';
const PORT         = parseInt(process.env.MACHINE_PORT || '4001', 10);
const CPU_CORES    = parseInt(process.env.CPU_CORES    || '4',    10);
const RAM_GB       = parseInt(process.env.RAM_GB       || '8',    10);

/* ── State ──────────────────────────────────────────────────────────────── */
let currentStatus  = 'idle';    // 'idle' | 'busy'
let tasksCompleted = 0;
const startTime    = Date.now();

/* ── App ────────────────────────────────────────────────────────────────── */
const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));

/* Request logger */
app.use((req, _res, next) => {
  console.log(`[${MACHINE_ID}] ${req.method} ${req.path}`);
  next();
});

/* ── GET /status ─────────────────────────────────────────────────────────── */
app.get('/status', (_req, res) => {
  res.json({
    machineId:      MACHINE_ID,
    status:         currentStatus,
    cpuCores:       CPU_CORES,
    ramGB:          RAM_GB,
    uptime:         Math.floor((Date.now() - startTime) / 1000),
    tasksCompleted,
  });
});

/* ── POST /task/math ─────────────────────────────────────────────────────── */
/**
 * Body: { taskId, equation, xFrom, xEnd, xStep }
 * Returns: { taskId, machineId, status, results: [{x, y}], pointsComputed, duration }
 */
app.post('/task/math', (req, res) => {
  const { taskId, equation, xFrom, xEnd, xStep } = req.body;

  if (!equation || xEnd === undefined || xFrom === undefined) {
    return res.status(400).json({ error: 'equation, xFrom, xEnd required' });
  }

  currentStatus = 'busy';
  const t0    = Date.now();
  const step  = Math.abs(Number(xStep) || 1);
  const from  = Number(xFrom);
  const to    = Number(xEnd);
  const results = [];

  for (let x = from; x <= to + step * 1e-9; x += step) {
    const xRound = +x.toFixed(10);
    try {
      const raw = evaluate(equation, { x: xRound });
      const y   = typeof raw === 'number' ? raw : Number(raw);
      if (isFinite(y)) results.push({ x: +xRound.toFixed(4), y: +y.toFixed(6) });
    } catch { /* skip any x where the expression is undefined */ }
  }

  tasksCompleted++;
  currentStatus = 'idle';

  res.json({
    taskId,
    machineId:      MACHINE_ID,
    status:         'complete',
    results,
    pointsComputed: results.length,
    duration:       Date.now() - t0,
  });
});

/* ── POST /task/image ────────────────────────────────────────────────────── */
/**
 * Body: { taskId, imageStrip: base64, stripIndex }
 * Returns: { taskId, machineId, status, grayscaleStrip: base64, stripIndex, duration }
 */
app.post('/task/image', async (req, res) => {
  const { taskId, imageStrip, stripIndex } = req.body;

  if (!imageStrip) {
    return res.status(400).json({ error: 'imageStrip (base64) required' });
  }

  currentStatus = 'busy';
  const t0 = Date.now();

  try {
    const inputBuffer     = Buffer.from(imageStrip, 'base64');
    const grayscaleBuffer = await sharp(inputBuffer)
      .grayscale()
      .toFormat('png')
      .toBuffer();

    tasksCompleted++;
    currentStatus = 'idle';

    res.json({
      taskId,
      machineId:      MACHINE_ID,
      status:         'complete',
      grayscaleStrip: grayscaleBuffer.toString('base64'),
      stripIndex:     stripIndex ?? 0,
      duration:       Date.now() - t0,
    });
  } catch (err) {
    currentStatus = 'idle';
    console.error(`[${MACHINE_ID}] Image processing error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── 404 ────────────────────────────────────────────────────────────────── */
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

/* ── Start ──────────────────────────────────────────────────────────────── */
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[${MACHINE_ID}] Worker service online — port ${PORT}`);
  console.log(`[${MACHINE_ID}] Resources: ${CPU_CORES} CPU cores / ${RAM_GB} GB RAM`);
});
