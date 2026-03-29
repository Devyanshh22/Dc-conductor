const express = require('express');
const db      = require('../db');

const router = express.Router();

/* ── POST /api/sessions/:id/tasks ── bulk insert tasks ─────────────────── */
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
      INSERT INTO tasks (
        session_id, task_id, name, type,
        equation, x_from, x_to, x_step, total_points,
        filename, width, height, file_size, image_data,
        estimated_cpu, estimated_ram, queue_position
      ) VALUES (
        @sessionId, @taskId, @name, @type,
        @equation, @xFrom, @xTo, @xStep, @totalPoints,
        @filename, @width, @height, @fileSize, @imageData,
        @estimatedCpu, @estimatedRam, @queuePosition
      )
    `);

    const insertMany = db.transaction((rows) => {
      for (const [i, t] of rows.entries()) {
        insert.run({
          sessionId,
          taskId:       t.id          ?? null,
          name:         t.name        ?? null,
          type:         t.type        ?? null,
          /* Math fields */
          equation:     t.equation    ?? null,
          xFrom:        t.xFrom       ?? null,
          xTo:          t.xTo         ?? null,
          xStep:        t.xStep       ?? null,
          totalPoints:  t.totalPoints ?? null,
          /* Image fields */
          filename:     t.filename    ?? null,
          width:        t.width       ?? null,
          height:       t.height      ?? null,
          fileSize:     t.fileSize    ?? null,
          imageData:    t.imageData   ?? null,
          /* Resource estimates */
          estimatedCpu: t.estimatedCPU ?? null,
          estimatedRam: t.estimatedRAM ?? null,
          queuePosition: i + 1,
        });
      }
    });

    insertMany(tasks);
    res.status(201).json({ inserted: tasks.length });
  } catch (err) {
    next(err);
  }
});

/* ── POST /api/sessions/:id/subtasks ── bulk insert sub-tasks ──────────── */
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
      INSERT INTO sub_tasks (
        session_id, sub_task_id, parent_task_id, name,
        cpu_required, ram_required, estimated_duration,
        operation_type, affinity_group
      ) VALUES (
        @sessionId, @subTaskId, @parentTaskId, @name,
        @cpuRequired, @ramRequired, @estimatedDuration,
        @operationType, @affinityGroup
      )
    `);

    const insertMany = db.transaction((rows) => {
      for (const s of rows) {
        insert.run({
          sessionId,
          subTaskId:         s.id              ?? null,
          parentTaskId:      s.parentTaskId    ?? null,
          name:              s.name            ?? null,
          cpuRequired:       s.cpuRequired     ?? s.cpu      ?? null,
          ramRequired:       s.ramRequired     ?? s.ram      ?? null,
          estimatedDuration: s.estimatedDuration ?? s.duration ?? null,
          operationType:     s.operationType   ?? null,
          affinityGroup:     s.affinityGroup   ?? null,
        });
      }
    });

    insertMany(subTasks);
    res.status(201).json({ inserted: subTasks.length });
  } catch (err) {
    next(err);
  }
});

/* ── GET /api/sessions/:id/tasks ── get all tasks for session ───────────── */
router.get('/:id/tasks', (req, res, next) => {
  try {
    const { id } = req.params;

    const session = db.prepare(`SELECT id FROM sessions WHERE id = ?`).get(id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const tasks    = db.prepare(`SELECT * FROM tasks     WHERE session_id = ? ORDER BY queue_position`).all(id);
    const subTasks = db.prepare(`SELECT * FROM sub_tasks WHERE session_id = ?`).all(id);

    res.json({ tasks, subTasks });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
