/**
 * Execution Engine — manages per-machine task queues and execution state.
 *
 * All functions are pure (no side-effects).
 * React components own the state; this module only computes transitions.
 */

export const TICK_MS = 100; // setInterval cadence (ms)

// ── Metric helpers ────────────────────────────────────────────────────────────

/** A task is "CPU-heavy" if it requests ≥4 cores, otherwise "RAM-heavy". */
export function getMetricType(task) {
  return task.cpuAllocated >= 4 ? 'cpu' : 'ram';
}

/**
 * Randomly-fluctuating performance metric.
 * CPU tasks → "Instructions processed" in M/s
 * RAM tasks → "Memory throughput" in GB/s
 */
export function generateMetricValue(task) {
  const type = getMetricType(task);
  if (type === 'cpu') {
    const base = task.cpuAllocated * 175;
    return Math.max(10, +(base + (Math.random() * 90 - 45)).toFixed(0));
  }
  const base = task.ramAllocated * 0.72;
  return Math.max(0.1, +(base + (Math.random() * 0.8 - 0.4)).toFixed(2));
}

// ── State builders ────────────────────────────────────────────────────────────

/**
 * Build the initial execution state from assignments and machines.
 *
 * @param {Array} assignments  Items from schedulerAssignments (status:'Scheduled')
 * @param {Array} machines     Items from schedulerMachines
 * @returns {{ taskStates: object, machineStates: object }}
 */
export function buildInitialState(assignments, machines) {
  const scheduled = assignments.filter(a => a.status === 'Scheduled');

  // Group by machine, preserving BFD order within each machine
  const machineQueues = {};
  scheduled.forEach(a => {
    if (!machineQueues[a.machineId]) machineQueues[a.machineId] = [];
    machineQueues[a.machineId].push(a);
  });

  // ── Task states ───────────────────────────────────────────────────────────
  const taskStates = {};
  scheduled.forEach(a => {
    taskStates[a.taskId] = {
      taskId:              a.taskId,
      taskName:            a.taskName,
      machineId:           a.machineId,
      machineName:         a.machineName,
      cpuAllocated:        a.cpuAllocated,
      ramAllocated:        a.ramAllocated,
      estimatedDurationMs: a.estimatedDuration * 1000,
      priority:            a.priority,
      // mutable execution fields
      status:    'queued',   // 'queued' | 'running' | 'completed'
      progress:  0,          // 0–100
      elapsedMs: 0,          // time this task has been running
      startMs:   null,       // ms-since-exec-start when task began
      metric:    0,          // live performance metric value
    };
  });

  // ── Machine states ────────────────────────────────────────────────────────
  const machineStates = {};
  machines.forEach(m => {
    const queue = (machineQueues[m.id] || []).map(a => a.taskId);
    machineStates[m.id] = {
      machineId:        m.id,
      machineName:      m.name,
      totalCpu:         m.cpu,
      totalRam:         m.ram,
      usedCpu:          0,
      usedRam:          0,
      // 'offline' | 'idle' | 'running' | 'complete'
      status:           m.status === 'Offline' ? 'offline' : 'idle',
      completedCount:   0,
      uptimeMs:         0,
      runningTaskId:    null,
      pendingQueue:     queue,          // task IDs not yet started
      completedTaskIds: [],
    };
  });

  return { taskStates, machineStates };
}

// ── Tick ──────────────────────────────────────────────────────────────────────

/**
 * Advance all machine queues by deltaMs.
 * Returns a brand-new state object (immutable update pattern).
 *
 * @param {object} prevState       { taskStates, machineStates }
 * @param {number} deltaMs         ms elapsed since last tick (≈ TICK_MS)
 * @param {number} execElapsedMs   total ms since execution began
 */
export function tickExecution(prevState, deltaMs, execElapsedMs) {
  // Shallow-copy top-level maps; we deep-copy individual entries as we mutate
  const taskStates    = { ...prevState.taskStates };
  const machineStates = { ...prevState.machineStates };

  for (const machineId of Object.keys(machineStates)) {
    let ms = { ...machineStates[machineId] };
    machineStates[machineId] = ms;

    if (ms.status === 'offline') continue;

    // ── Advance uptime ────────────────────────────────────────────────────
    ms.uptimeMs = ms.uptimeMs + deltaMs;

    // ── Advance currently-running task ────────────────────────────────────
    if (ms.runningTaskId !== null) {
      let ts = { ...taskStates[ms.runningTaskId] };
      taskStates[ms.runningTaskId] = ts;

      ts.elapsedMs = ts.elapsedMs + deltaMs;

      if (ts.elapsedMs >= ts.estimatedDurationMs) {
        // ── Task completed ──────────────────────────────────────────────
        ts.elapsedMs = ts.estimatedDurationMs;
        ts.progress  = 100;
        ts.status    = 'completed';
        ts.metric    = 0;

        ms.usedCpu          = Math.max(0, ms.usedCpu - ts.cpuAllocated);
        ms.usedRam          = Math.max(0, ms.usedRam - ts.ramAllocated);
        ms.completedCount   = ms.completedCount + 1;
        ms.completedTaskIds = [...ms.completedTaskIds, ts.taskId];
        ms.runningTaskId    = null;
      } else {
        // ── Task still running ──────────────────────────────────────────
        ts.progress = Math.min(99, Math.floor(
          (ts.elapsedMs / ts.estimatedDurationMs) * 100
        ));
        ts.metric = generateMetricValue(ts);
      }
    }

    // ── Start next queued task (if slot just freed or machine was idle) ───
    if (ms.runningTaskId === null && ms.pendingQueue.length > 0) {
      const [nextId, ...rest] = ms.pendingQueue;
      ms.pendingQueue = rest;

      let ts = { ...taskStates[nextId] };
      taskStates[nextId] = ts;

      ts.status  = 'running';
      ts.startMs = execElapsedMs;
      ts.metric  = generateMetricValue(ts);

      ms.runningTaskId = nextId;
      ms.usedCpu       = ms.usedCpu + ts.cpuAllocated;
      ms.usedRam       = ms.usedRam + ts.ramAllocated;
      ms.status        = 'running';
    }

    // ── Finalise machine status when queue drains ─────────────────────────
    if (ms.runningTaskId === null && ms.pendingQueue.length === 0) {
      if (ms.completedCount > 0) {
        ms.status  = 'complete';
      }
      ms.usedCpu = 0;
      ms.usedRam = 0;
    }
  }

  return { taskStates, machineStates };
}

// ── Derived metrics ───────────────────────────────────────────────────────────

/**
 * Compute summary numbers for the global metrics bar.
 *
 * @returns {{ total, completed, running, queued, overallProgress, etaMs }}
 */
export function computeGlobalMetrics(taskStates, machineStates) {
  const tasks     = Object.values(taskStates);
  const total     = tasks.length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const running   = tasks.filter(t => t.status === 'running').length;
  const queued    = tasks.filter(t => t.status === 'queued').length;

  const overallProgress = total === 0
    ? 0
    : Math.floor(tasks.reduce((s, t) => s + t.progress, 0) / total);

  // ETA = max remaining work across all active machines
  let etaMs = 0;
  for (const ms of Object.values(machineStates)) {
    if (ms.status === 'offline' || ms.status === 'complete' || ms.status === 'idle') continue;

    let remaining = 0;
    if (ms.runningTaskId && taskStates[ms.runningTaskId]) {
      const rt = taskStates[ms.runningTaskId];
      remaining += Math.max(0, rt.estimatedDurationMs - rt.elapsedMs);
    }
    ms.pendingQueue.forEach(tid => {
      if (taskStates[tid]) remaining += taskStates[tid].estimatedDurationMs;
    });
    if (remaining > etaMs) etaMs = remaining;
  }

  return { total, completed, running, queued, overallProgress, etaMs };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Format milliseconds → human-readable "Xs" or "Xm YYs". */
export function formatMs(ms) {
  if (!ms || ms <= 0) return '0s';
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

/**
 * Build the final results array for localStorage (`schedulerResults`).
 *
 * @param {object} taskStates   Final task states (all completed)
 * @param {number} execStartMs  wall-clock ms when execution began (Date.now())
 */
export function buildResults(taskStates, execStartMs) {
  return Object.values(taskStates).map(ts => ({
    taskId:         ts.taskId,
    taskName:       ts.taskName,
    machineId:      ts.machineId,
    machineName:    ts.machineName,
    cpuAllocated:   ts.cpuAllocated,
    ramAllocated:   ts.ramAllocated,
    startTime:      new Date(execStartMs + (ts.startMs ?? 0)).toISOString(),
    endTime:        new Date(execStartMs + (ts.startMs ?? 0) + ts.estimatedDurationMs).toISOString(),
    actualDuration: +(ts.estimatedDurationMs / 1000).toFixed(1),
    status:         'completed',
  }));
}
