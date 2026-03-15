const express = require('express');
const db      = require('../db');

const router = express.Router();

/* ── POST /api/sessions/:id/results ── bulk insert results ──────────── */
router.post('/:id/results', (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);
    const results   = req.body;

    if (!Array.isArray(results) || results.length === 0) {
      return res.status(400).json({ error: 'Expected a non-empty array of results' });
    }

    const session = db.prepare(`SELECT id FROM sessions WHERE id = ?`).get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const insert = db.prepare(`
      INSERT INTO results
        (session_id, task_id, task_name, machine_id, machine_name,
         cpu_allocated, ram_allocated, start_time, end_time,
         actual_duration, status, is_sub_task, parent_task_id)
      VALUES
        (@sessionId, @taskId, @taskName, @machineId, @machineName,
         @cpuAllocated, @ramAllocated, @startTime, @endTime,
         @actualDuration, @status, @isSubTask, @parentTaskId)
    `);

    const insertMany = db.transaction((rows) => {
      for (const r of rows) {
        insert.run({
          sessionId,
          taskId:         r.taskId,
          taskName:       r.taskName,
          machineId:      r.machineId      ?? null,
          machineName:    r.machineName    ?? null,
          cpuAllocated:   r.cpuAllocated   ?? 0,
          ramAllocated:   r.ramAllocated   ?? 0,
          startTime:      r.startTime      ?? null,
          endTime:        r.endTime        ?? null,
          actualDuration: r.actualDuration ?? null,
          status:         r.status,
          isSubTask:      r.parentTaskId ? 1 : 0,
          parentTaskId:   r.parentTaskId   ?? null,
        });
      }
    });

    insertMany(results);
    res.status(201).json({ inserted: results.length });
  } catch (err) {
    next(err);
  }
});

/* ── GET /api/sessions/:id/results ── get all results for session ──── */
router.get('/:id/results', (req, res, next) => {
  try {
    const { id } = req.params;

    const session = db.prepare(`SELECT id FROM sessions WHERE id = ?`).get(id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const results = db.prepare(`
      SELECT * FROM results WHERE session_id = ? ORDER BY id
    `).all(id);

    res.json(results);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
