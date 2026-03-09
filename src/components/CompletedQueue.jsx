/**
 * CompletedQueue
 * Bottom panel that fills as tasks finish execution.
 * Shows a card per completed task, a counter, a waiting message,
 * and the "Proceed to Output" button once everything is done.
 *
 * Props:
 *   completedTasks {Array}    - task-state objects with status === 'completed'
 *   totalTasks     {number}   - total scheduled task count
 *   onProceed      {function} - called when user clicks Proceed
 *   phase          {string}   - 'running' | 'done'
 */
export default function CompletedQueue({ completedTasks, totalTasks, onProceed, phase }) {
  const count     = completedTasks.length;
  const remaining = totalTasks - count;
  const allDone   = count === totalTasks && totalTasks > 0;

  return (
    <div
      className={`
        rounded-2xl border p-5 transition-colors duration-500
        ${allDone
          ? 'bg-green-950/30 border-green-700/40'
          : 'bg-slate-800/40 border-slate-700'}
      `}
    >
      {/* ── Header row ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-sm font-semibold text-slate-300">
            Completed — Awaiting Merge
          </h3>

          {/* Counter badge */}
          <span
            className={`
              text-xs font-mono px-2.5 py-0.5 rounded-full font-bold
              ${allDone
                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : 'bg-slate-700 text-slate-300 border border-slate-600'}
            `}
          >
            {count} / {totalTasks}
          </span>

          {allDone && (
            <span className="exec-checklist-enter text-xs font-medium text-green-400 flex items-center gap-1">
              <span className="text-sm">✓</span>
              All tasks complete — ready to merge
            </span>
          )}
        </div>

        {/* Proceed button */}
        <button
          onClick={onProceed}
          disabled={!allDone}
          className={`
            px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-300
            ${allDone
              ? 'bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white shadow-lg shadow-indigo-900/40 cursor-pointer'
              : 'bg-slate-700/60 text-slate-500 cursor-not-allowed border border-slate-600/40'}
          `}
        >
          {allDone ? 'Proceed to Output →' : `Waiting for ${remaining} more…`}
        </button>
      </div>

      {/* ── Waiting message ── */}
      {!allDone && phase === 'running' && count < totalTasks && (
        <p className="text-xs text-slate-600 italic mb-3">
          Waiting for {remaining} more task{remaining !== 1 ? 's' : ''} to complete
          before result merge can begin…
        </p>
      )}

      {/* ── Task cards grid ── */}
      {count === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-600">
          <span className="text-3xl opacity-40">📭</span>
          <p className="text-sm">No tasks completed yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {completedTasks.map(task => (
            <CompletedTaskCard key={task.taskId} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── CompletedTaskCard ─────────────────────────────────────────────────────────

const PRIORITY_DOT = {
  Critical: 'bg-red-500',
  High:     'bg-orange-500',
  Medium:   'bg-yellow-500',
  Low:      'bg-green-500',
};

function CompletedTaskCard({ task }) {
  const durationSec = (task.estimatedDurationMs / 1000).toFixed(1);

  return (
    <div className="completed-card-enter bg-slate-900/70 border border-green-700/25 rounded-lg p-3 flex flex-col gap-1.5">
      {/* Name + priority dot */}
      <div className="flex items-start gap-1.5">
        <span
          className={`
            w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1
            ${PRIORITY_DOT[task.priority] ?? 'bg-slate-500'}
          `}
        />
        <span className="text-xs font-semibold text-slate-200 leading-snug line-clamp-2">
          {task.taskName}
        </span>
      </div>

      {/* Machine */}
      <p className="text-[10px] text-slate-500 truncate pl-3">
        {task.machineName}
      </p>

      {/* Duration + Done badge */}
      <div className="flex items-center justify-between pl-3 mt-0.5">
        <span className="text-[10px] font-mono text-slate-600">{durationSec}s</span>
        <span className="text-[10px] font-bold text-green-400 flex items-center gap-0.5">
          <span>✓</span> Done
        </span>
      </div>

      {/* CPU / RAM allocation pills */}
      <div className="flex gap-1 pl-3 flex-wrap">
        <span className="text-[9px] bg-indigo-900/40 text-indigo-300 px-1.5 py-0.5 rounded font-mono">
          {task.cpuAllocated}c
        </span>
        <span className="text-[9px] bg-purple-900/40 text-purple-300 px-1.5 py-0.5 rounded font-mono">
          {task.ramAllocated}GB
        </span>
      </div>
    </div>
  );
}
