/**
 * SQLite connection using Node.js built-in node:sqlite (Node 22+).
 * No native addon compilation — no external dependencies.
 *
 * We monkey-patch a .transaction() helper onto the db object so every
 * route file can use the same `db.transaction(fn)(args)` pattern that
 * better-sqlite3 provides — no route changes needed.
 *
 * NOTE: If the schema changes, delete conductor.db and restart the server.
 */
const { DatabaseSync } = require('node:sqlite');
const path             = require('path');

const DB_PATH = path.join(__dirname, 'conductor.db');

const db = new DatabaseSync(DB_PATH);

/* Enable WAL mode and foreign keys */
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

/* ── Schema initialisation ──────────────────────────────────────────────── */
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    status       TEXT    NOT NULL DEFAULT 'active',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    INTEGER,
    task_id       TEXT,
    name          TEXT,
    type          TEXT,
    equation      TEXT,
    x_from        REAL,
    x_to          REAL,
    x_step        REAL,
    total_points  INTEGER,
    filename      TEXT,
    width         INTEGER,
    height        INTEGER,
    file_size     INTEGER,
    image_data    TEXT,
    estimated_cpu REAL,
    estimated_ram REAL,
    queue_position INTEGER,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sub_tasks (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id         INTEGER,
    sub_task_id        TEXT,
    parent_task_id     TEXT,
    name               TEXT,
    cpu_required       REAL,
    ram_required       REAL,
    estimated_duration REAL,
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

console.log('[DB] Schema initialized');

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
