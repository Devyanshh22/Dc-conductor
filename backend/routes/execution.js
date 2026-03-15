/**
 * routes/execution.js
 *
 * POST /api/execution/start   — dispatch a session's assignments to worker threads
 * GET  /api/execution/status  — return current pool status
 */
'use strict';

const express    = require('express');
const { dispatchTask, startExecution, getPoolStatus } = require('../workerPool');

const router = express.Router();

/* ── POST /api/execution/start ──────────────────────────────────────────── */
router.post('/start', (req, res) => {
  const { sessionId, assignments } = req.body;

  if (!Array.isArray(assignments) || assignments.length === 0) {
    return res.status(400).json({ error: 'assignments array is required' });
  }

  /* Only dispatch tasks that were actually scheduled */
  const scheduled = assignments.filter(a => a.status === 'Scheduled' && a.machineId);

  if (scheduled.length === 0) {
    return res.status(400).json({ error: 'No schedulable assignments found' });
  }

  /* Register the total so workerPool can fire execution_complete */
  startExecution(scheduled.length);

  /* Dispatch each assignment to its machine's worker queue */
  let dispatched = 0;
  for (const a of scheduled) {
    const task = {
      taskId:            a.taskId,
      taskName:          a.taskName,
      machineId:         a.machineId,
      machineName:       a.machineName,
      cpuAllocated:      a.cpuAllocated,
      ramAllocated:      a.ramAllocated,
      estimatedDuration: a.estimatedDuration ?? 5,
      operationType:     a.operationType ?? 'Compute',
      parentTaskId:      a.parentTaskId ?? null,
    };

    const ok = dispatchTask(task, a.machineId);
    if (ok) dispatched++;
    else    console.warn(`[Execution] Unknown machineId: ${a.machineId}`);
  }

  console.log(`[Execution] Session ${sessionId}: dispatched ${dispatched}/${scheduled.length} tasks`);

  res.json({ status: 'started', sessionId, totalTasks: dispatched });
});

/* ── GET /api/execution/status ──────────────────────────────────────────── */
router.get('/status', (_req, res) => {
  res.json({ workers: getPoolStatus() });
});

module.exports = router;
