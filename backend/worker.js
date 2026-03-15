/**
 * worker.js — Conductor Machine Worker Thread
 *
 * Each instance of this file runs as a separate Worker Thread representing
 * one virtual machine. It accepts task messages, performs real CPU-bound
 * work scaled to estimatedDuration, and streams progress back to the
 * coordinator (server.js) via parentPort.
 */
'use strict';

const { parentPort, workerData } = require('worker_threads');

const { machineId } = workerData;

/* ── CPU-bound work functions ───────────────────────────────────────────── */

/** Arithmetic: fibonacci iterations */
function doFibChunk() {
  let a = 0n, b = 1n;
  for (let i = 0; i < 80_000; i++) {
    const t = a + b; a = b; b = t;
  }
  return Number(b % 1_000_000n);
}

/** Compute: bubble sort on a random array */
function doSortChunk() {
  const len = 600;
  const arr = Array.from({ length: len }, () => Math.random());
  for (let i = 0; i < len; i++) {
    for (let j = 0; j < len - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        const tmp = arr[j]; arr[j] = arr[j + 1]; arr[j + 1] = tmp;
      }
    }
  }
  return arr[0];
}

/** Memory: allocate and fill a 2 MB buffer */
function doMemChunk() {
  const buf = Buffer.allocUnsafe(2 * 1024 * 1024);
  buf.fill(0xAB);
  return buf[0];
}

/** I/O: JSON round-trip on a moderate-sized object */
function doIOChunk() {
  const obj = { records: Array.from({ length: 1500 }, (_, i) => ({ id: i, v: Math.random() })) };
  return JSON.parse(JSON.stringify(obj)).records.length;
}

/** Render: string-building loop */
function doRenderChunk() {
  let s = '';
  for (let i = 0; i < 15_000; i++) s += String.fromCharCode(65 + (i % 26));
  return s.length;
}

const WORK_FN = {
  Arithmetic: doFibChunk,
  Compute:    doSortChunk,
  Memory:     doMemChunk,
  'I/O':      doIOChunk,
  Render:     doRenderChunk,
};

/* ── Metric generators (realistic fluctuating values) ───────────────────── */

function noise() { return 0.82 + Math.random() * 0.36; }

const METRIC_FN = {
  Arithmetic: () => `Instructions: ${(380 * noise()).toFixed(0)} M/s`,
  Compute:    () => `FLOPS: ${(3.4  * noise()).toFixed(2)} G/s`,
  Memory:     () => `Throughput: ${(5.1  * noise()).toFixed(2)} GB/s`,
  'I/O':      () => `Ops: ${(140  * noise()).toFixed(0)} K/s`,
  Render:     () => `Frames: ${(72   * noise()).toFixed(0)}/s`,
};

function getMetric(operationType) {
  return (METRIC_FN[operationType] ?? (() => `Load: ${(noise() * 100).toFixed(0)}%`))();
}

/* ── Message handler ────────────────────────────────────────────────────── */

parentPort.on('message', (task) => {
  const {
    taskId,
    estimatedDuration = 5,
    operationType     = 'Compute',
  } = task;

  const totalMs = Math.max(500, estimatedDuration * 1000);
  const workFn  = WORK_FN[operationType] ?? doFibChunk;

  /* Notify coordinator the task has started */
  parentPort.postMessage({ type: 'started', taskId, machineId });

  const start        = Date.now();
  let   lastProgress = start;

  /* ── Main execution loop ─────────────────────────────────────────────
     Runs CPU-bound work in tight iterations.
     Every ~100 ms sends a progress update.
     Runs until elapsed time >= estimatedDuration.                      */
  while (true) {
    workFn();                                       // real CPU work

    const now     = Date.now();
    const elapsed = now - start;

    if (now - lastProgress >= 100) {
      const percent = Math.min(99, Math.round(elapsed / totalMs * 100));
      parentPort.postMessage({
        type:    'progress',
        taskId,
        machineId,
        percent,
        metric:  getMetric(operationType),
        elapsed,
      });
      lastProgress = now;
    }

    if (elapsed >= totalMs) break;
  }

  const actualDuration = parseFloat(((Date.now() - start) / 1000).toFixed(3));
  parentPort.postMessage({ type: 'complete', taskId, machineId, actualDuration });
});
