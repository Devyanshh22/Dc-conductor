/**
 * SQLite connection using Node.js built-in node:sqlite (Node 23+).
 * No native addon compilation — no external dependencies.
 *
 * We monkey-patch a .transaction() helper onto the db object so every
 * route file can use the same `db.transaction(fn)(args)` pattern that
 * better-sqlite3 provides — no route changes needed.
 */
const { DatabaseSync } = require('node:sqlite');
const path             = require('path');

const DB_PATH = path.join(__dirname, 'conductor.db');

const db = new DatabaseSync(DB_PATH);

/* Enable WAL mode and foreign keys */
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

/* ── Schema initialisation ──────────────────────────────────────────── */
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    status       TEXT    NOT NULL DEFAULT 'active',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id         INTEGER NOT NULL REFERENCES sessions(id),
    task_id            TEXT    NOT NULL,
    name               TEXT    NOT NULL,
    cpu_required       INTEGER NOT NULL,
    ram_required       INTEGER NOT NULL,
    priority           TEXT    NOT NULL,
    estimated_duration INTEGER NOT NULL,
    operation_type     TEXT,
    queue_position     INTEGER,
    created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sub_tasks (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id         INTEGER NOT NULL REFERENCES sessions(id),
    sub_task_id        TEXT    NOT NULL,
    parent_task_id     TEXT    NOT NULL,
    name               TEXT    NOT NULL,
    cpu_required       REAL    NOT NULL,
    ram_required       REAL    NOT NULL,
    estimated_duration REAL    NOT NULL,
    operation_type     TEXT,
    affinity_group     TEXT
  );

  CREATE TABLE IF NOT EXISTS machines (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    INTEGER NOT NULL REFERENCES sessions(id),
    machine_id    TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    cpu_total     INTEGER NOT NULL,
    ram_total     INTEGER NOT NULL,
    cpu_available INTEGER NOT NULL,
    ram_available INTEGER NOT NULL,
    status        TEXT    NOT NULL,
    type          TEXT
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id         INTEGER NOT NULL REFERENCES sessions(id),
    task_id            TEXT    NOT NULL,
    task_name          TEXT    NOT NULL,
    machine_id         TEXT,
    machine_name       TEXT,
    cpu_allocated      REAL    NOT NULL DEFAULT 0,
    ram_allocated      REAL    NOT NULL DEFAULT 0,
    estimated_duration REAL    NOT NULL DEFAULT 0,
    status             TEXT    NOT NULL,
    is_sub_task        INTEGER NOT NULL DEFAULT 0,
    parent_task_id     TEXT
  );

  CREATE TABLE IF NOT EXISTS results (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL REFERENCES sessions(id),
    task_id         TEXT    NOT NULL,
    task_name       TEXT    NOT NULL,
    machine_id      TEXT,
    machine_name    TEXT,
    cpu_allocated   REAL    NOT NULL DEFAULT 0,
    ram_allocated   REAL    NOT NULL DEFAULT 0,
    start_time      REAL,
    end_time        REAL,
    actual_duration REAL,
    status          TEXT    NOT NULL,
    is_sub_task     INTEGER NOT NULL DEFAULT 0,
    parent_task_id  TEXT
  );
`);

/**
 * Transaction helper — mirrors the better-sqlite3 API:
 *   const fn = db.transaction((rows) => { ... });
 *   fn(rows);  ← runs the body inside BEGIN/COMMIT/ROLLBACK
 */
db.transaction = function transaction(fn) {
  return function (...args) {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
};

module.exports = db;
