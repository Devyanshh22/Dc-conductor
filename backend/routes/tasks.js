const express = require('express');
const db      = require('../db');

const router = express.Router();

/* ── POST /api/sessions/:id/tasks ── bulk insert tasks ─────────────── */
router.post('/:id/tasks', (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);
    const tasks     = req.body;

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: 'Expected a non-empty array of tasks' });
    }

    const session = db.prepare(`SELECT id FROM sessions WHERE id = ?`).get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const insert = db.prepare(`
      INSERT INTO tasks
        (session_id, task_id, name, cpu_required, ram_required,
         priority, estimated_duration, operation_type, queue_position)
      VALUES
        (@sessionId, @taskId, @name, @cpuRequired, @ramRequired,
         @priority, @estimatedDuration, @operationType, @queuePosition)
    `);

    const insertMany = db.transaction((rows) => {
      for (const [i, t] of rows.entries()) {
        insert.run({
          sessionId,
          taskId:            t.id,
          name:              t.name,
          cpuRequired:       t.cpu,
          ramRequired:       t.ram,
          priority:          t.priority,
          estimatedDuration: t.duration,
          operationType:     t.operationType ?? null,
          queuePosition:     i + 1,
        });
      }
    });

    insertMany(tasks);
    res.status(201).json({ inserted: tasks.length });
  } catch (err) {
    next(err);
  }
});

/* ── POST /api/sessions/:id/subtasks ── bulk insert sub-tasks ─────── */
router.post('/:id/subtasks', (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);
    const subTasks  = req.body;

    if (!Array.isArray(subTasks) || subTasks.length === 0) {
      return res.status(400).json({ error: 'Expected a non-empty array of sub-tasks' });
    }

    const session = db.prepare(`SELECT id FROM sessions WHERE id = ?`).get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const insert = db.prepare(`
      INSERT INTO sub_tasks
        (session_id, sub_task_id, parent_task_id, name,
         cpu_required, ram_required, estimated_duration,
         operation_type, affinity_group)
      VALUES
        (@sessionId, @subTaskId, @parentTaskId, @name,
         @cpuRequired, @ramRequired, @estimatedDuration,
         @operationType, @affinityGroup)
    `);

    const insertMany = db.transaction((rows) => {
      for (const s of rows) {
        insert.run({
          sessionId,
          subTaskId:         s.id,
          parentTaskId:      s.parentTaskId,
          name:              s.name,
          cpuRequired:       s.cpu,
          ramRequired:       s.ram,
          estimatedDuration: s.duration,
          operationType:     s.operationType ?? null,
          affinityGroup:     s.affinityGroup ?? null,
        });
      }
    });

    insertMany(subTasks);
    res.status(201).json({ inserted: subTasks.length });
  } catch (err) {
    next(err);
  }
});

/* ── GET /api/sessions/:id/tasks ── get all tasks for session ─────── */
router.get('/:id/tasks', (req, res, next) => {
  try {
    const { id } = req.params;

    const session = db.prepare(`SELECT id FROM sessions WHERE id = ?`).get(id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const tasks    = db.prepare(`SELECT * FROM tasks    WHERE session_id = ? ORDER BY queue_position`).all(id);
    const subTasks = db.prepare(`SELECT * FROM sub_tasks WHERE session_id = ?`).all(id);

    res.json({ tasks, subTasks });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
