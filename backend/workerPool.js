'use strict';

/**
 * workerPool.js — HTTP-based worker registry
 *
 * Instead of Node.js worker threads, each "machine" is an independent
 * Docker container running worker-service/worker.js on a dedicated port.
 * The coordinator communicates with workers over HTTP within the Docker network.
 *
 * Worker URLs are injected via environment variables (set in docker-compose.yml):
 *   WORKER_ALPHA   http://worker-alpha:4001
 *   WORKER_BETA    http://worker-beta:4002
 *   WORKER_GAMMA   http://worker-gamma:4003
 *   WORKER_DELTA   http://worker-delta:4004
 *   WORKER_EPSILON http://worker-epsilon:4005
 *
 * Falls back to localhost ports when running outside Docker.
 */

/* ── Worker URL map ─────────────────────────────────────────────────────── */
const WORKER_URLS = {
  'Node-Alpha':   process.env.WORKER_ALPHA   || 'http://localhost:4001',
  'Node-Beta':    process.env.WORKER_BETA    || 'http://localhost:4002',
  'Node-Gamma':   process.env.WORKER_GAMMA   || 'http://localhost:4003',
  'Node-Delta':   process.env.WORKER_DELTA   || 'http://localhost:4004',
  'Node-Epsilon': process.env.WORKER_EPSILON || 'http://localhost:4005',
};

/* ── Registry ───────────────────────────────────────────────────────────── */
/**
 * Each entry:
 * {
 *   machineId: string,
 *   url:       string,
 *   cpuCores:  number,
 *   ramGB:     number,
 *   status:    'idle' | 'busy' | 'offline',
 *   tasksCompleted: number,
 * }
 */
const registry = new Map();

/* ── Ping helper ─────────────────────────────────────────────────────────── */
const PING_TIMEOUT_MS = 3_000;

async function pingWorker(machineId, url) {
  try {
    const ac  = new AbortController();
    const tid = setTimeout(() => ac.abort(), PING_TIMEOUT_MS);
    const res = await fetch(`${url}/status`, { signal: ac.signal });
    clearTimeout(tid);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* ── initRegistry ────────────────────────────────────────────────────────── */
/**
 * Ping every worker on startup; mark each as idle or offline.
 * Also starts the background polling loop (every 5 s).
 */
async function initRegistry() {
  for (const [machineId, url] of Object.entries(WORKER_URLS)) {
    const data = await pingWorker(machineId, url);
    registry.set(machineId, {
      machineId,
      url,
      cpuCores:       data?.cpuCores ?? _defaultCores(machineId),
      ramGB:          data?.ramGB    ?? _defaultRam(machineId),
      status:         data ? 'idle' : 'offline',
      tasksCompleted: data?.tasksCompleted ?? 0,
    });
    console.log(`[Registry] ${machineId}: ${data ? 'online' : 'offline'} (${url})`);
  }

  /* Background health poll — never mark a busy worker offline mid-task */
  setInterval(async () => {
    for (const [machineId, entry] of registry.entries()) {
      if (entry.status === 'busy') continue;
      const data = await pingWorker(machineId, entry.url);
      if (data) {
        entry.cpuCores       = data.cpuCores;
        entry.ramGB          = data.ramGB;
        entry.tasksCompleted = data.tasksCompleted;
        if (entry.status === 'offline') {
          entry.status = 'idle';
          console.log(`[Registry] ${machineId} came back online`);
        }
      } else if (entry.status !== 'offline') {
        entry.status = 'offline';
        console.warn(`[Registry] ${machineId} went offline`);
      }
    }
  }, 5_000);
}

/* ── dispatchMath ────────────────────────────────────────────────────────── */
/**
 * Send a math task to the worker at machineId.
 * Task: { taskId, equation, xFrom, xEnd, xStep }
 * Returns the worker's JSON response.
 */
async function dispatchMath(machineId, task) {
  const entry = _requireEntry(machineId);
  entry.status = 'busy';
  const t0 = Date.now();
  try {
    const res = await _post(entry.url, '/task/math', task, 120_000);
    entry.status = 'idle';
    entry.tasksCompleted++;
    console.log(`[Registry] ${machineId} math done in ${Date.now() - t0}ms`);
    return res;
  } catch (err) {
    entry.status = 'idle';
    throw err;
  }
}

/* ── dispatchImage ───────────────────────────────────────────────────────── */
/**
 * Send an image strip to the worker at machineId.
 * Task: { taskId, imageStrip: base64, stripIndex }
 * Returns the worker's JSON response.
 */
async function dispatchImage(machineId, task) {
  const entry = _requireEntry(machineId);
  entry.status = 'busy';
  const t0 = Date.now();
  try {
    const res = await _post(entry.url, '/task/image', task, 180_000);
    entry.status = 'idle';
    entry.tasksCompleted++;
    console.log(`[Registry] ${machineId} image done in ${Date.now() - t0}ms`);
    return res;
  } catch (err) {
    entry.status = 'idle';
    throw err;
  }
}

/* ── getRegistryStatus ───────────────────────────────────────────────────── */
function getRegistryStatus() {
  return Array.from(registry.values());
}

/* ── Internal helpers ────────────────────────────────────────────────────── */

/**
 * Normalize machineId to "Node-Alpha" format.
 * Handles: "alpha" → "Node-Alpha", "node-alpha" → "Node-Alpha", "Node-Alpha" → "Node-Alpha"
 */
function normalizeMachineId(machineId) {
  if (!machineId) return '';
  const lower = machineId.toLowerCase();
  const base = lower.startsWith('node-') ? lower.slice(5) : lower;
  return 'Node-' + base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
}

/**
 * Find a worker entry in the registry, tolerating id format mismatches.
 */
function findWorker(machineId) {
  const normalized = normalizeMachineId(machineId);
  if (registry.has(normalized)) return registry.get(normalized);
  // Fallback: case-insensitive scan
  for (const entry of registry.values()) {
    if (entry.machineId.toLowerCase() === machineId.toLowerCase()) return entry;
  }
  return null;
}

function _requireEntry(machineId) {
  const entry = findWorker(machineId);
  if (!entry) throw new Error(`Unknown machine: ${machineId} (normalized: ${normalizeMachineId(machineId)})`);
  if (entry.status === 'offline') throw new Error(`Worker ${entry.machineId} is offline`);
  return entry;
}

async function _post(baseUrl, path, body, timeoutMs) {
  const ac  = new AbortController();
  const tid = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  ac.signal,
    });
    clearTimeout(tid);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Worker ${path} returned ${res.status}: ${text}`);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(tid);
    throw err;
  }
}

/** Sensible defaults when a worker is offline at startup */
function _defaultCores(machineId) {
  return { 'Node-Alpha': 16, 'Node-Beta': 8, 'Node-Gamma': 8, 'Node-Delta': 4, 'Node-Epsilon': 2 }[machineId] ?? 4;
}
function _defaultRam(machineId) {
  return { 'Node-Alpha': 64, 'Node-Beta': 32, 'Node-Gamma': 16, 'Node-Delta': 16, 'Node-Epsilon': 8 }[machineId] ?? 8;
}

module.exports = { initRegistry, dispatchMath, dispatchImage, getRegistryStatus };
