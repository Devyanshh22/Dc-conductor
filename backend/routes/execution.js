'use strict';

/**
 * routes/execution.js
 *
 * POST /api/execution/start   — dispatch all scheduled assignments to workers
 * GET  /api/execution/workers — live worker registry status
 * GET  /api/execution/status  — alias for /workers (backward compat)
 *
 * Math tasks:   full x-range dispatched to the assigned worker.
 * Image tasks:  base64 data-URL decoded → sent as one strip (single machine)
 *               or split into N horizontal strips (multi-machine).
 *               Strips stitched back in order before broadcasting result.
 *
 * After each task completes a task_complete WS message is broadcast.
 * Once every task is done an execution_complete message is broadcast.
 *
 * NOTE: If schema changes, delete conductor.db and restart.
 */

const express = require('express');
const db      = require('../db');
const { dispatchMath, dispatchImage, getRegistryStatus } = require('../workerPool');

const router = express.Router();

/* ── WebSocket broadcast ─────────────────────────────────────────────────── */
let _broadcast = null;

/** Called once by server.js after the WS server is ready. */
function setBroadcast(fn) {
  _broadcast = fn;
}

function broadcast(data) {
  if (_broadcast) _broadcast(data);
}

/* ── Normalise a DB row (snake_case) to the camelCase shape the
      dispatch code expects.  Called when the request body lookup misses. ── */
function _normalizeDbTask(row) {
  return {
    id:          row.task_id,
    name:        row.name,
    type:        row.type,
    equation:    row.equation,
    xFrom:       row.x_from,
    xTo:         row.x_to,
    xStep:       row.x_step,
    totalPoints: row.total_points,
    filename:    row.filename,
    width:       row.width,
    height:      row.height,
    fileSize:    row.file_size,
    imageData:   row.image_data,
    estimatedCPU: row.estimated_cpu,
    estimatedRAM: row.estimated_ram,
  };
}

/* ── POST /api/execution/start ───────────────────────────────────────────── */
router.post('/start', async (req, res) => {
  /* ── Diagnostic logging ─────────────────────────────────────────────── */
  console.log('[Execution] sessionId:', req.body.sessionId);
  console.log('[Execution] assignments count:', req.body.assignments?.length);
  console.log('[Execution] tasks in body:', req.body.tasks?.length);
  console.log('[Execution] first assignment:', JSON.stringify(req.body.assignments?.[0]));
  console.log('[Execution] first task:', JSON.stringify(req.body.tasks?.[0]));

  const { sessionId, assignments = [] } = req.body;

  if (!assignments.length) {
    return res.status(400).json({ error: 'assignments array is required' });
  }

  /* ── Resolve tasks: body first, then DB fallback ────────────────────── */
  let tasks = req.body.tasks ?? [];
  if (!tasks.length && sessionId) {
    const dbTasks = db.prepare('SELECT * FROM tasks WHERE session_id = ?').all(sessionId);
    console.log('[Execution] DB tasks found:', dbTasks.length);
    tasks = dbTasks.map(_normalizeDbTask);
  }

  /* ── Build taskId → task lookup (handle id / taskId / task_id variants) ── */
  const taskById = {};
  tasks.forEach(t => {
    if (t.id)      taskById[t.id]      = t;
    if (t.taskId)  taskById[t.taskId]  = t;
    if (t.task_id) taskById[t.task_id] = t;
  });

  const scheduled = assignments.filter(a => a.status === 'Scheduled' && a.machineId);
  if (!scheduled.length) {
    return res.status(400).json({ error: 'No schedulable assignments found' });
  }

  /* Respond immediately — execution runs async */
  res.json({ status: 'started', sessionId, totalTasks: scheduled.length });

  /* ── Dispatch all assignments concurrently ─────────────────────────────── */
  const execStart      = Date.now();
  let   completedCount = 0;
  const total          = scheduled.length;

  /* Track image tasks that have already been dispatched (avoid duplicate strips) */
  const dispatchedImageTasks = new Set();

  const taskPromises = scheduled.map(async (assignment) => {
    /* ── Task lookup: taskById map first, then per-row DB fallback ── */
    console.log('[Execution] Looking for taskId:', assignment.taskId);
    console.log('[Execution] Available task IDs:', tasks.map(t => t.taskId || t.task_id || t.id));

    let task = taskById[assignment.taskId];

    if (!task && sessionId) {
      const row = db.prepare(
        'SELECT * FROM tasks WHERE task_id = ? AND session_id = ?'
      ).get(assignment.taskId, sessionId);
      if (row) task = _normalizeDbTask(row);
    }

    if (!task) {
      console.warn(`[Execution] No task data for taskId=${assignment.taskId} — skipping`);
      completedCount++;
      _checkAllDone(completedCount, total, execStart);
      return;
    }

    console.log(`[Execution] Found task: "${task.name}" type: ${task.type}`);
    console.log(`[Execution] Dispatching to: ${assignment.machineId}`);

    try {
      /* ── Math task ───────────────────────────────────────────────────── */
      if (task.type === 'math') {
        const result = await dispatchMath(assignment.machineId, {
          taskId:   task.id,
          equation: task.equation,
          xFrom:    task.xFrom,
          xEnd:     task.xTo,
          xStep:    task.xStep,
        });

        /* Fire math_segment_complete first so the UI can render immediately */
        broadcast({
          type:           'math_segment_complete',
          taskId:         assignment.taskId,
          machineId:      assignment.machineId,
          results:        result.results,
          pointsComputed: result.pointsComputed,
          duration:       result.duration,
          segmentIndex:   0,
          totalSegments:  1,
        });

        broadcast({
          type:           'task_complete',
          taskId:         assignment.taskId,
          machineId:      assignment.machineId,
          actualDuration: result.duration != null ? +(result.duration / 1000).toFixed(3) : 0,
          taskType:       'math',
          mathResults:    result.results,
          pointsComputed: result.pointsComputed,
        });

      /* ── Image task ──────────────────────────────────────────────────── */
      } else if (task.type === 'image') {
        /* Skip duplicate dispatches when multiple assignments share a taskId */
        if (dispatchedImageTasks.has(task.id)) return;
        dispatchedImageTasks.add(task.id);

        /* Strip data-URL prefix */
        const base64 = task.imageData?.includes(',')
          ? task.imageData.split(',')[1]
          : (task.imageData ?? '');

        if (!base64) throw new Error(`Task ${task.id} has no imageData`);

        /* Find all assignments for this image task */
        const imageAssignments = scheduled.filter(a => a.taskId === assignment.taskId);
        const numStrips        = imageAssignments.length;

        if (numStrips === 1) {
          /* Single-machine: send full image as one strip */
          const result = await dispatchImage(assignment.machineId, {
            taskId:     task.id,
            imageStrip: base64,
            stripIndex: 0,
          });

          const durationS = result.duration != null ? +(result.duration / 1000).toFixed(3) : 0;
          const finalUrl  = `data:image/png;base64,${result.grayscaleStrip}`;

          broadcast({
            type:           'image_strip_complete',
            taskId:         assignment.taskId,
            machineId:      assignment.machineId,
            machineName:    assignment.machineId,
            stripIndex:     0,
            totalStrips:    1,
            grayscaleStrip: result.grayscaleStrip,
            duration:       durationS,
          });

          broadcast({
            type:       'image_complete',
            taskId:     assignment.taskId,
            finalImage: finalUrl,
          });

          broadcast({
            type:           'task_complete',
            taskId:         assignment.taskId,
            machineId:      assignment.machineId,
            actualDuration: durationS,
            taskType:       'image',
            grayscaleData:  finalUrl,
          });

        } else {
          /* Multi-machine: split into N horizontal strips */
          const { strips, width, height } = await _splitImageIntoStrips(base64, numStrips);

          /* Dispatch all strips concurrently; broadcast each as it finishes */
          const stripResults = await Promise.all(
            imageAssignments.map((a, idx) =>
              dispatchImage(a.machineId, {
                taskId:     task.id,
                imageStrip: strips[idx].base64,
                stripIndex: idx,
              }).then(result => {
                broadcast({
                  type:           'image_strip_complete',
                  taskId:         task.id,
                  machineId:      a.machineId,
                  machineName:    a.machineId,
                  stripIndex:     idx,
                  totalStrips:    numStrips,
                  grayscaleStrip: result.grayscaleStrip,
                  duration:       result.duration != null ? +(result.duration / 1000).toFixed(3) : 0,
                });
                return result;
              }),
            ),
          );

          const stitched   = await _stitchStrips(stripResults, width, height);
          const totalDurMs = stripResults.reduce((s, r) => s + (r.duration ?? 0), 0);
          const finalUrl   = `data:image/png;base64,${stitched}`;

          broadcast({
            type:       'image_complete',
            taskId:     assignment.taskId,
            finalImage: finalUrl,
          });

          broadcast({
            type:           'task_complete',
            taskId:         assignment.taskId,
            machineId:      assignment.machineId,
            actualDuration: +(totalDurMs / 1000).toFixed(3),
            taskType:       'image',
            grayscaleData:  finalUrl,
          });
        }

      } else {
        console.warn(`[Execution] Unknown task type: "${task.type}" for task ${assignment.taskId}`);
      }
    } catch (err) {
      console.error(`[Execution] Error dispatching task ${assignment.taskId}:`, err.message);
      broadcast({
        type:           'task_complete',
        taskId:         assignment.taskId,
        machineId:      assignment.machineId,
        actualDuration: 0,
        error:          err.message,
      });
    }

    completedCount++;
    _checkAllDone(completedCount, total, execStart);
  });

  Promise.all(taskPromises).catch(err =>
    console.error('[Execution] Unhandled error:', err),
  );
});

/* ── GET /api/execution/workers ──────────────────────────────────────────── */
router.get('/workers', (_req, res) => {
  res.json({ workers: getRegistryStatus() });
});

/* ── GET /api/execution/status (backward compat) ─────────────────────────── */
router.get('/status', (_req, res) => {
  res.json({ workers: getRegistryStatus() });
});

/* ── Image helpers ───────────────────────────────────────────────────────── */

async function _splitImageIntoStrips(base64, numStrips) {
  const sharp  = require('sharp');
  const buffer = Buffer.from(base64, 'base64');
  const meta   = await sharp(buffer).metadata();
  const { width, height } = meta;

  const stripH = Math.ceil(height / numStrips);
  const strips  = [];

  for (let i = 0; i < numStrips; i++) {
    const top = i * stripH;
    const h   = Math.min(stripH, height - top);
    if (h <= 0) break;

    const buf = await sharp(buffer)
      .extract({ left: 0, top, width, height: h })
      .toFormat('png')
      .toBuffer();

    strips.push({ index: i, base64: buf.toString('base64') });
  }

  return { strips, width, height };
}

async function _stitchStrips(stripResults, width, height) {
  const sharp  = require('sharp');
  const sorted = [...stripResults].sort((a, b) => a.stripIndex - b.stripIndex);

  const composites = [];
  let currentTop   = 0;

  for (const strip of sorted) {
    const buf  = Buffer.from(strip.grayscaleStrip, 'base64');
    const meta = await sharp(buf).metadata();
    composites.push({ input: buf, top: currentTop, left: 0 });
    currentTop += meta.height;
  }

  const result = await sharp({
    create: { width, height, channels: 1, background: { r: 0, g: 0, b: 0 } },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return result.toString('base64');
}

function _checkAllDone(completed, total, startMs) {
  if (completed < total) return;
  const totalDuration = +((Date.now() - startMs) / 1000).toFixed(2);
  console.log(`[Execution] All ${total} tasks complete in ${totalDuration}s`);
  broadcast({
    type:          'execution_complete',
    totalDuration,
    summary:       getRegistryStatus().map(w => ({
      machineId:      w.machineId,
      tasksCompleted: w.tasksCompleted,
    })),
  });
}

module.exports = { router, setBroadcast };
