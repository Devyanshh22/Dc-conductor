const express = require('express');
const db      = require('../db');

const router = express.Router();

/* ── POST /api/sessions/:id/assignments ── bulk insert assignments ──── */
router.post('/:id/assignments', (req, res, next) => {
  try {
    const sessionId  = Number(req.params.id);
    const assignments = req.body;

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ error: 'Expected a non-empty array of assignments' });
    }

    const session = db.prepare(`SELECT id FROM sessions WHERE id = ?`).get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const insert = db.prepare(`
      INSERT INTO assignments
        (session_id, task_id, task_name, machine_id, machine_name,
         cpu_allocated, ram_allocated, estimated_duration, status,
         is_sub_task, parent_task_id)
      VALUES
        (@sessionId, @taskId, @taskName, @machineId, @machineName,
         @cpuAllocated, @ramAllocated, @estimatedDuration, @status,
         @isSubTask, @parentTaskId)
    `);

    const insertMany = db.transaction((rows) => {
      for (const a of rows) {
        insert.run({
          sessionId,
          taskId:            a.taskId,
          taskName:          a.taskName,
          machineId:         a.machineId    ?? null,
          machineName:       a.machineName  ?? null,
          cpuAllocated:      a.cpuAllocated  ?? 0,
          ramAllocated:      a.ramAllocated  ?? 0,
          estimatedDuration: a.estimatedDuration ?? 0,
          status:            a.status,
          isSubTask:         a.parentTaskId ? 1 : 0,
          parentTaskId:      a.parentTaskId ?? null,
        });
      }
    });

    insertMany(assignments);
    res.status(201).json({ inserted: assignments.length });
  } catch (err) {
    next(err);
  }
});

/* ── GET /api/sessions/:id/assignments ── get all assignments ─────── */
router.get('/:id/assignments', (req, res, next) => {
  try {
    const { id } = req.params;

    const session = db.prepare(`SELECT id FROM sessions WHERE id = ?`).get(id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const assignments = db.prepare(`
      SELECT * FROM assignments WHERE session_id = ? ORDER BY id
    `).all(id);

    res.json(assignments);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
