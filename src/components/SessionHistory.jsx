import { useState, useEffect } from 'react';
import { getAllSessions, getSessionDetail } from '../utils/apiClient';

/* ── Date formatter ─────────────────────────────────────────────────── */
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  try {
    /* SQLite returns "YYYY-MM-DD HH:MM:SS" without timezone suffix */
    const d = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T'));
    return d.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/* ── Inline helpers ─────────────────────────────────────────────────── */
const STATUS_BADGE = {
  active:    'bg-blue-900/40 border-blue-500/40 text-blue-300',
  completed: 'bg-green-900/40 border-green-500/40 text-green-300',
};

function StatusBadge({ status }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border
      ${STATUS_BADGE[status] ?? 'bg-slate-700 border-slate-600 text-slate-400'}`}>
      {status}
    </span>
  );
}

const PRIORITY_DOT = {
  Critical: 'bg-red-500',
  High:     'bg-orange-500',
  Medium:   'bg-yellow-500',
  Low:      'bg-green-500',
};

/* ── Session list table ─────────────────────────────────────────────── */
function SessionTable({ sessions, onView, busy }) {
  if (sessions.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500">
        <p className="text-4xl opacity-25 mb-4">📂</p>
        <p className="text-sm">No sessions recorded yet.</p>
        <p className="text-xs text-slate-600 mt-1">
          Complete a scheduling run to see it here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-800/80">
            {['Session Name', 'Date', 'Tasks', 'Status', 'Actions'].map(h => (
              <th key={h}
                className="px-4 py-3 text-left text-slate-400 font-semibold
                  uppercase tracking-wide whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sessions.map((s, i) => (
            <tr key={s.id}
              className={`border-t border-slate-700/40
                ${i % 2 === 0 ? '' : 'bg-slate-800/20'}`}>
              <td className="px-4 py-3 font-semibold text-slate-200 max-w-[220px] truncate">
                {s.name}
              </td>
              <td className="px-4 py-3 font-mono text-slate-400 whitespace-nowrap">
                {fmtDate(s.created_at)}
              </td>
              <td className="px-4 py-3 font-mono text-slate-300 text-center">
                {s.task_count}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={s.status} />
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => onView(s.id)}
                  disabled={busy}
                  className="px-3 py-1 rounded-lg text-[11px] font-semibold
                    bg-indigo-700 hover:bg-indigo-600 text-white transition-colors
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Session detail ─────────────────────────────────────────────────── */
function SessionDetail({ session, onRestore }) {
  const { tasks = [], assignments = [], results = [], machines = [] } = session;

  /* Efficiency: scheduled / total assignments */
  const scheduled  = assignments.filter(a => a.status === 'Scheduled').length;
  const efficiency = assignments.length > 0
    ? Math.round((scheduled / assignments.length) * 100)
    : 0;

  /* Session duration */
  const durationS = session.completed_at && session.created_at
    ? Math.round(
        (new Date(session.completed_at.replace(' ', 'T')) -
         new Date(session.created_at.replace(' ', 'T'))) / 1000
      )
    : null;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Metadata row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetaCard label="Status"     value={<StatusBadge status={session.status} />} />
        <MetaCard label="Created"    value={fmtDate(session.created_at)} mono />
        <MetaCard label="Duration"   value={durationS != null ? `${durationS}s` : '—'} mono />
        <MetaCard label="Efficiency" value={`${efficiency}%`}
          highlight={efficiency >= 80 ? 'text-green-400' : efficiency >= 50 ? 'text-yellow-400' : 'text-red-400'} />
      </div>

      {/* ── Tasks ── */}
      <DetailSection title="Tasks" count={tasks.length}>
        {tasks.length === 0
          ? <EmptyRow msg="No tasks recorded." />
          : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-800/60">
                  {['#', 'Name', 'CPU', 'RAM', 'Duration', 'Priority', 'Op Type'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-slate-400 font-semibold
                      uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tasks.map((t, i) => (
                  <tr key={t.id} className={`border-t border-slate-700/40
                    ${i % 2 === 0 ? '' : 'bg-slate-800/20'}`}>
                    <td className="px-3 py-2 text-slate-500 font-mono">{t.queue_position}</td>
                    <td className="px-3 py-2 font-semibold text-slate-200 max-w-[160px] truncate">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5
                        ${PRIORITY_DOT[t.priority] ?? 'bg-slate-500'}`} />
                      {t.name}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-300">{t.cpu_required}c</td>
                    <td className="px-3 py-2 font-mono text-slate-300">{t.ram_required} GB</td>
                    <td className="px-3 py-2 font-mono text-slate-300">{t.estimated_duration}s</td>
                    <td className="px-3 py-2 text-slate-400">{t.priority}</td>
                    <td className="px-3 py-2 text-slate-400">{t.operation_type ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </DetailSection>

      {/* ── Assignment summary ── */}
      <DetailSection title="Assignments" count={assignments.length}
        badge={`${scheduled} scheduled · ${assignments.length - scheduled} unschedulable`}>
        {assignments.length === 0
          ? <EmptyRow msg="No assignments recorded." />
          : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-800/60">
                  {['Task', 'Machine', 'CPU', 'RAM', 'Est. Duration', 'Status'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-slate-400 font-semibold
                      uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assignments.map((a, i) => (
                  <tr key={a.id} className={`border-t border-slate-700/40
                    ${a.is_sub_task ? 'bg-orange-900/5' : (i % 2 === 0 ? '' : 'bg-slate-800/20')}`}>
                    <td className="px-3 py-2 font-semibold text-slate-200 max-w-[180px] truncate">
                      {a.is_sub_task ? (
                        <span className="text-[9px] text-orange-400 font-mono mr-1">sub</span>
                      ) : null}
                      {a.task_name}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-300">{a.machine_name ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-slate-300">{a.cpu_allocated > 0 ? `${a.cpu_allocated}c` : '—'}</td>
                    <td className="px-3 py-2 font-mono text-slate-300">{a.ram_allocated > 0 ? `${a.ram_allocated} GB` : '—'}</td>
                    <td className="px-3 py-2 font-mono text-slate-300">{a.estimated_duration}s</td>
                    <td className="px-3 py-2">
                      <span className={`font-bold ${
                        a.status === 'Scheduled' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {a.status === 'Scheduled' ? '✓' : '✗'} {a.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </DetailSection>

      {/* ── Results ── */}
      <DetailSection title="Results" count={results.length}>
        {results.length === 0
          ? <EmptyRow msg="No results recorded." />
          : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-800/60">
                  {['Task', 'Machine', 'CPU', 'RAM', 'Actual Duration', 'Status'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-slate-400 font-semibold
                      uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={r.id} className={`border-t border-slate-700/40
                    ${i % 2 === 0 ? '' : 'bg-slate-800/20'}`}>
                    <td className="px-3 py-2 font-semibold text-slate-200 max-w-[180px] truncate">
                      {r.task_name}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-300">{r.machine_name ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-slate-300">{r.cpu_allocated > 0 ? `${r.cpu_allocated}c` : '—'}</td>
                    <td className="px-3 py-2 font-mono text-slate-300">{r.ram_allocated > 0 ? `${r.ram_allocated} GB` : '—'}</td>
                    <td className="px-3 py-2 font-mono text-slate-300">
                      {r.actual_duration != null ? `${Number(r.actual_duration).toFixed(1)}s` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`font-bold ${
                        r.status === 'Completed' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {r.status === 'Completed' ? '✓' : '✗'} {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </DetailSection>

      {/* ── Restore ── */}
      {results.length > 0 && (
        <div className="pt-2">
          <button
            onClick={onRestore}
            className="w-full rounded-xl py-3 text-sm font-semibold
              bg-violet-700 hover:bg-violet-600 active:bg-violet-800
              text-white shadow-lg shadow-violet-900/30 transition-all"
          >
            Restore Session → Jump to Phase 5
          </button>
          <p className="text-[10px] text-slate-600 text-center mt-2">
            Loads stored tasks, assignments, and results — then opens the Output dashboard.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Small sub-components ───────────────────────────────────────────── */

function MetaCard({ label, value, mono, highlight }) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 px-4 py-3">
      <p className="text-[9px] text-slate-500 uppercase font-semibold tracking-wider mb-1">{label}</p>
      <p className={`text-sm font-bold ${highlight ?? 'text-slate-200'} ${mono ? 'font-mono' : ''}`}>
        {value}
      </p>
    </div>
  );
}

function DetailSection({ title, count, badge, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{title}</h3>
        {count !== undefined && (
          <span className="text-[10px] bg-slate-800 text-slate-500 border border-slate-700 px-2 py-0.5 rounded-full font-mono">
            {count}
          </span>
        )}
        {badge && (
          <span className="text-[10px] text-slate-500">{badge}</span>
        )}
        <div className="flex-1 h-px bg-slate-700/40" />
      </div>
      <div className="rounded-xl border border-slate-700 overflow-x-auto">
        {children}
      </div>
    </div>
  );
}

function EmptyRow({ msg }) {
  return (
    <p className="text-xs text-slate-600 text-center py-6">{msg}</p>
  );
}

/* ── Main export ────────────────────────────────────────────────────── */
export default function SessionHistory({ onClose, onRestore }) {
  const [sessions,      setSessions]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [detailSession, setDetailSession] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    getAllSessions().then(data => {
      setSessions(data ?? []);
      setLoading(false);
    });
  }, []);

  async function handleView(id) {
    setLoadingDetail(true);
    setDetailSession(null);
    const detail = await getSessionDetail(id);
    setDetailSession(detail);
    setLoadingDetail(false);
  }

  function handleRestore() {
    onRestore(detailSession);
  }

  const showList   = !loading && !detailSession && !loadingDetail;
  const showDetail = !loadingDetail && !!detailSession;
  const showSpinner = loading || loadingDetail;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center
        p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div className="bg-slate-900 rounded-2xl border border-slate-700
        w-full max-w-5xl my-8 flex flex-col shadow-2xl shadow-black/60">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4
          border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            {detailSession && (
              <button
                onClick={() => setDetailSession(null)}
                className="text-slate-400 hover:text-slate-200 text-xs font-semibold
                  px-2.5 py-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                ← Back
              </button>
            )}
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />
              {detailSession ? detailSession.name : 'Session History'}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 text-lg font-bold
              w-8 h-8 flex items-center justify-center rounded-lg
              hover:bg-slate-800 transition-colors leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto max-h-[75vh]">
          {showSpinner && (
            <div className="flex items-center justify-center py-20 gap-3 text-slate-500 text-sm">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
              {loading ? 'Loading sessions…' : 'Loading session detail…'}
            </div>
          )}

          {showList && (
            <SessionTable
              sessions={sessions}
              onView={handleView}
              busy={loadingDetail}
            />
          )}

          {showDetail && (
            <SessionDetail
              session={detailSession}
              onRestore={handleRestore}
            />
          )}
        </div>
      </div>
    </div>
  );
}
