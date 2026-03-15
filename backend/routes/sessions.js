const express = require('express');
const db      = require('../db');

const router = express.Router();

/* ── Helpers ─────────────────────────────────────────────────────────── */

/** Build a human-readable session name, e.g. "Session #4 — 12 Mar 2026 14:32" */
function buildSessionName(id) {
  const now    = new Date();
  const day    = now.getDate().toString().padStart(2, '0');
  const month  = now.toLocaleString('en-GB', { month: 'short' });
  const year   = now.getFullYear();
  const hh     = now.getHours().toString().padStart(2, '0');
  const mm     = now.getMinutes().toString().padStart(2, '0');
  return `Session #${id} — ${day} ${month} ${year} ${hh}:${mm}`;
}

/* ── POST /api/sessions ── create new session ──────────────────────── */
router.post('/', (req, res, next) => {
  try {
    /* Insert with a placeholder name first to get the AUTOINCREMENT id */
    const insert = db.prepare(
      `INSERT INTO sessions (name, status) VALUES ('__placeholder__', 'active')`
    );
    const { lastInsertRowid: id } = insert.run();

    const name = buildSessionName(id);
    db.prepare(`UPDATE sessions SET name = ? WHERE id = ?`).run(name, id);

    res.status(201).json({ sessionId: id, name });
  } catch (err) {
    next(err);
  }
});

/* ── GET /api/sessions ── list all sessions ─────────────────────────── */
router.get('/', (_req, res, next) => {
  try {
    const sessions = db.prepare(`
      SELECT
        s.id,
        s.name,
        s.status,
        s.created_at,
        s.completed_at,
        COUNT(t.id) AS task_count
      FROM sessions s
      LEFT JOIN tasks t ON t.session_id = s.id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `).all();

    res.json(sessions);
  } catch (err) {
    next(err);
  }
});

/* ── GET /api/sessions/:id ── full session detail ───────────────────── */
router.get('/:id', (req, res, next) => {
  try {
    const { id } = req.params;

    const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    session.tasks       = db.prepare(`SELECT * FROM tasks       WHERE session_id = ? ORDER BY queue_position`).all(id);
    session.sub_tasks   = db.prepare(`SELECT * FROM sub_tasks   WHERE session_id = ?`).all(id);
    session.machines    = db.prepare(`SELECT * FROM machines    WHERE session_id = ?`).all(id);
    session.assignments = db.prepare(`SELECT * FROM assignments WHERE session_id = ?`).all(id);
    session.results     = db.prepare(`SELECT * FROM results     WHERE session_id = ?`).all(id);

    res.json(session);
  } catch (err) {
    next(err);
  }
});

/* ── PATCH /api/sessions/:id/complete ── mark session completed ─────── */
router.patch('/:id/complete', (req, res, next) => {
  try {
    const { id } = req.params;

    const session = db.prepare(`SELECT id FROM sessions WHERE id = ?`).get(id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    db.prepare(`
      UPDATE sessions
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
