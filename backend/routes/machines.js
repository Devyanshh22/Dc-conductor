const express = require('express');
const db      = require('../db');

const router = express.Router();

/* ── POST /api/sessions/:id/machines ── bulk insert machines ────────── */
router.post('/:id/machines', (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);
    const machines  = req.body;

    if (!Array.isArray(machines) || machines.length === 0) {
      return res.status(400).json({ error: 'Expected a non-empty array of machines' });
    }

    const session = db.prepare(`SELECT id FROM sessions WHERE id = ?`).get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const insert = db.prepare(`
      INSERT INTO machines
        (session_id, machine_id, name, cpu_total, ram_total,
         cpu_available, ram_available, status, type)
      VALUES
        (@sessionId, @machineId, @name, @cpuTotal, @ramTotal,
         @cpuAvailable, @ramAvailable, @status, @type)
    `);

    const insertMany = db.transaction((rows) => {
      for (const m of rows) {
        insert.run({
          sessionId,
          machineId:    m.id,
          name:         m.name,
          cpuTotal:     m.cpu,
          ramTotal:     m.ram,
          cpuAvailable: m.status === 'Offline' ? 0 : m.cpu,
          ramAvailable: m.status === 'Offline' ? 0 : m.ram,
          status:       m.status,
          type:         m.type ?? null,
        });
      }
    });

    insertMany(machines);
    res.status(201).json({ inserted: machines.length });
  } catch (err) {
    next(err);
  }
});

/* ── GET /api/sessions/:id/machines ── get all machines for session ── */
router.get('/:id/machines', (req, res, next) => {
  try {
    const { id } = req.params;

    const session = db.prepare(`SELECT id FROM sessions WHERE id = ?`).get(id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const machines = db.prepare(`SELECT * FROM machines WHERE session_id = ? ORDER BY id`).all(id);
    res.json(machines);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
