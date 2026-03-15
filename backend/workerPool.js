/**
 * workerPool.js — Conductor Worker Thread Pool
 *
 * Manages 5 persistent Worker threads (one per virtual machine).
 * Each worker has its own task queue; tasks run sequentially per machine.
 * Progress and completion events are forwarded to registered callbacks
 * so server.js can broadcast them over WebSocket.
 */
'use strict';

const { Worker } = require('worker_threads');
const path       = require('path');

/* ── Machine definitions (match frontend presets in src/data/machines.js) ── */
const MACHINE_DEFS = [
  { id: 'alpha',   name: 'Node-Alpha'   },
  { id: 'beta',    name: 'Node-Beta'    },
  { id: 'gamma',   name: 'Node-Gamma'   },
  { id: 'delta',   name: 'Node-Delta'   },
  { id: 'epsilon', name: 'Node-Epsilon' },
];

const WORKER_PATH = path.join(__dirname, 'worker.js');

/* ── Pool state ─────────────────────────────────────────────────────────── */

/** @type {Map<string, {worker: Worker, status: string, queue: Array, currentTask: any, machineName: string}>} */
const workers = new Map();

const progressCallbacks = [];
const completeCallbacks = [];
const doneCallbacks     = [];

/* Execution-run tracking */
let executionTotal     = 0;
let executionCompleted = 0;
let executionStartTime = null;

/** Per-machine stats for the summary event */
const runStats = new Map();   // machineId -> { tasksCompleted, totalMs }

/* ── Init ───────────────────────────────────────────────────────────────── */

/**
 * Spawn all 5 worker threads.
 * Resolves when every worker has fired its 'online' event.
 */
function initPool() {
  return new Promise((resolve, reject) => {
    let ready = 0;

    for (const def of MACHINE_DEFS) {
      const worker = new Worker(WORKER_PATH, {
        workerData: { machineId: def.id },
      });

      const state = {
        worker,
        machineId:   def.id,
        machineName: def.name,
        status:      'idle',
        queue:       [],
        currentTask: null,
      };
      workers.set(def.id, state);

      worker.on('online', () => {
        ready++;
        if (ready === MACHINE_DEFS.length) resolve();
      });

      worker.on('message',  (msg) => _handleMessage(def.id, msg));
      worker.on('error',    (err) => console.error(`[Pool:${def.id}] Worker error:`, err));
      worker.on('exit',     (code) => {
        if (code !== 0) console.error(`[Pool:${def.id}] Worker exited with code ${code}`);
      });
    }

    /* Safety timeout: if workers don't come online in 10 s, reject */
    setTimeout(() => reject(new Error('Worker pool init timeout')), 10_000);
  });
}

/* ── Internal message handler ───────────────────────────────────────────── */

function _handleMessage(machineId, msg) {
  const state = workers.get(machineId);
  if (!state) return;

  switch (msg.type) {
    case 'started': {
      state.status = 'busy';
      break;
    }

    case 'progress': {
      for (const cb of progressCallbacks) cb(msg);
      break;
    }

    case 'complete': {
      state.status      = 'idle';
      state.currentTask = null;
      executionCompleted++;

      /* Update per-machine stats */
      const ms = runStats.get(machineId) ?? { tasksCompleted: 0, totalMs: 0 };
      ms.tasksCompleted++;
      ms.totalMs += (msg.actualDuration ?? 0) * 1000;
      runStats.set(machineId, ms);

      /* Fire per-task complete callbacks */
      for (const cb of completeCallbacks) cb(msg);

      /* Check if entire execution run is finished */
      if (executionTotal > 0 && executionCompleted >= executionTotal) {
        const totalDuration = parseFloat(((Date.now() - executionStartTime) / 1000).toFixed(2));
        const summary = [];
        for (const [mid, st] of runStats.entries()) {
          summary.push({
            machineId:      mid,
            machineName:    workers.get(mid)?.machineName ?? mid,
            tasksCompleted: st.tasksCompleted,
            totalTime:      parseFloat((st.totalMs / 1000).toFixed(2)),
          });
        }
        for (const cb of doneCallbacks) cb({ totalDuration, summary });
        /* Reset for next run */
        executionTotal     = 0;
        executionCompleted = 0;
        executionStartTime = null;
        runStats.clear();
      }

      /* Dequeue next task for this worker if any */
      if (state.queue.length > 0) {
        const next = state.queue.shift();
        _send(machineId, next);
      }
      break;
    }
  }
}

/* ── Internal send ──────────────────────────────────────────────────────── */

function _send(machineId, task) {
  const state = workers.get(machineId);
  if (!state) return;
  state.status      = 'busy';
  state.currentTask = task;
  state.worker.postMessage(task);
}

/* ── Public API ─────────────────────────────────────────────────────────── */

/**
 * Dispatch a task to the correct worker.
 * If the worker is busy, the task is queued.
 * Returns false if machineId is unknown.
 */
function dispatchTask(task, machineId) {
  const state = workers.get(machineId);
  if (!state) return false;

  if (state.status === 'idle') {
    _send(machineId, task);
  } else {
    state.queue.push(task);
  }
  return true;
}

/**
 * Set the total task count for the current execution run and record start time.
 * Must be called before dispatching tasks so the "all done" event fires correctly.
 */
function startExecution(total) {
  executionTotal     = total;
  executionCompleted = 0;
  executionStartTime = Date.now();
  runStats.clear();
}

/** Register a callback invoked for every progress update from any worker. */
function onProgress(cb) { progressCallbacks.push(cb); }

/** Register a callback invoked when any single task completes. */
function onComplete(cb) { completeCallbacks.push(cb); }

/** Register a callback invoked once when ALL tasks in a run are complete. */
function onAllDone(cb) { doneCallbacks.push(cb); }

/** Returns a snapshot of all workers' current state (safe to JSON-serialize). */
function getPoolStatus() {
  const result = [];
  for (const [, state] of workers.entries()) {
    result.push({
      machineId:   state.machineId,
      machineName: state.machineName,
      status:      state.status,
      queueLength: state.queue.length,
      currentTask: state.currentTask
        ? { taskId: state.currentTask.taskId, taskName: state.currentTask.taskName }
        : null,
    });
  }
  return result;
}

module.exports = { initPool, dispatchTask, startExecution, onProgress, onComplete, onAllDone, getPoolStatus };
