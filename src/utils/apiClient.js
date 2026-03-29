/**
 * Thin fetch wrapper for the Conductor backend (localhost:3001).
 *
 * All functions are async and swallow errors — a failed API call is
 * logged to the console but never throws, so the frontend keeps
 * working even when the backend is offline.
 *
 * localStorage writes are NOT removed; they remain the primary
 * cross-phase state bus within a session.
 */

const BASE = 'http://localhost:3001/api';

async function apiFetch(path, options = {}) {
  const url    = `${BASE}${path}`;
  const method = options.method ?? 'GET';
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status} ${res.statusText}: ${body}`);
    }
    return await res.json();
  } catch (err) {
    console.warn(`[apiClient] ${method} ${url} →`, err.message);
    return null;
  }
}

/* ── Session lifecycle ──────────────────────────────────────────────── */

/** Create a new session. Returns { sessionId, name } or null. */
export async function createSession() {
  return apiFetch('/sessions', { method: 'POST' });
}

/** Mark a session as completed. */
export async function completeSession(sessionId) {
  return apiFetch(`/sessions/${sessionId}/complete`, { method: 'PATCH' });
}

/* ── Bulk data saves ────────────────────────────────────────────────── */

/** Save the full task list for a session. */
export async function saveTasks(sessionId, tasks) {
  return apiFetch(`/sessions/${sessionId}/tasks`, {
    method: 'POST',
    body:   JSON.stringify(tasks),
  });
}

/** Save the decomposed sub-tasks for a session. */
export async function saveSubTasks(sessionId, subTasks) {
  return apiFetch(`/sessions/${sessionId}/subtasks`, {
    method: 'POST',
    body:   JSON.stringify(subTasks),
  });
}

/** Save the machine fleet snapshot for a session. */
export async function saveMachines(sessionId, machines) {
  return apiFetch(`/sessions/${sessionId}/machines`, {
    method: 'POST',
    body:   JSON.stringify(machines),
  });
}

/** Save BFD assignments for a session. */
export async function saveAssignments(sessionId, assignments) {
  return apiFetch(`/sessions/${sessionId}/assignments`, {
    method: 'POST',
    body:   JSON.stringify(assignments),
  });
}

/** Save execution results for a session. */
export async function saveResults(sessionId, results) {
  return apiFetch(`/sessions/${sessionId}/results`, {
    method: 'POST',
    body:   JSON.stringify(results),
  });
}

/* ── Execution ──────────────────────────────────────────────────────── */

/**
 * Dispatch a session's assignments to the worker-thread execution engine.
 * Returns { status, totalTasks } or null.
 */
export async function startExecution(sessionId, assignments) {
  const tasks = JSON.parse(localStorage.getItem('schedulerTasks') || '[]');
  return apiFetch('/execution/start', {
    method: 'POST',
    body:   JSON.stringify({ sessionId, assignments, tasks }),
  });
}

/* ── Read / history ─────────────────────────────────────────────────── */

/** Get all sessions (summary list). Returns array or null. */
export async function getAllSessions() {
  return apiFetch('/sessions');
}

/** Get full session detail with joined tables. Returns object or null. */
export async function getSessionDetail(sessionId) {
  return apiFetch(`/sessions/${sessionId}`);
}
