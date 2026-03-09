import { getMetricType, formatMs } from '../utils/executionEngine';

/**
 * TaskProgressRow
 * One row in the "Active Task Progress" middle section.
 * Shows name, machine, status badge, live progress bar, %, time, and a
 * simulated performance metric that fluctuates while the task is running.
 *
 * Props:
 *   task {object} - taskState from executionEngine
 */

const PRIORITY_BADGE = {
  Critical: 'bg-red-500/15 text-red-400 border-red-500/30',
  High:     'bg-orange-500/15 text-orange-400 border-orange-500/30',
  Medium:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  Low:      'bg-green-500/15 text-green-400 border-green-500/30',
};

const STATUS_CFG = {
  queued:    { label: 'Queued',   cls: 'bg-slate-700/60 text-slate-500 border-slate-600/40' },
  running:   { label: 'Running',  cls: 'bg-blue-900/50 text-blue-300 border-blue-600/50'   },
  completed: { label: 'Complete', cls: 'bg-green-900/30 text-green-400 border-green-600/40' },
};

export default function TaskProgressRow({ task }) {
  const {
    taskName,
    machineName,
    priority,
    status,
    progress,
    elapsedMs,
    estimatedDurationMs,
    metric,
  } = task;

  const isRunning = status === 'running';
  const isDone    = status === 'completed';
  const isQueued  = status === 'queued';

  const sc         = STATUS_CFG[status] ?? STATUS_CFG.queued;
  const metricType = getMetricType(task);

  return (
    <div
      className={`
        task-row-enter rounded-xl border px-4 py-3
        flex flex-wrap items-center gap-x-4 gap-y-2
        transition-colors duration-300
        ${isRunning ? 'bg-slate-800/70 border-slate-600/70'             : ''}
        ${isDone    ? 'bg-green-950/15 border-green-800/25 opacity-55'  : ''}
        ${isQueued  ? 'bg-slate-800/30 border-slate-700/30 opacity-50'  : ''}
      `}
    >
      {/* ── Task name + priority badge ── */}
      <div className="flex items-center gap-2 flex-1 min-w-[160px]">
        <span
          className={`
            text-[10px] px-1.5 py-0.5 rounded border font-bold flex-shrink-0
            ${PRIORITY_BADGE[priority] ?? 'bg-slate-700/60 text-slate-400 border-slate-600/40'}
          `}
        >
          {/* Show first letter of priority to save width */}
          {priority?.[0] ?? '?'}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-200 truncate">{taskName}</p>
          <p className="text-[10px] text-slate-600 truncate">{machineName}</p>
        </div>
      </div>

      {/* ── Status badge ── */}
      <span
        className={`
          text-[11px] px-2.5 py-0.5 rounded-full border font-medium
          flex items-center gap-1.5 flex-shrink-0 ${sc.cls}
        `}
      >
        {isRunning && (
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
        )}
        {isDone && <span>✓</span>}
        {sc.label}
      </span>

      {/* ── Progress bar ── */}
      <div className="flex-1 min-w-[120px]">
        <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
          <div
            className={`
              h-full rounded-full transition-all duration-200
              ${isRunning ? 'progress-bar-shimmer bg-gradient-to-r from-indigo-500 via-purple-400 to-indigo-500' : ''}
              ${isDone    ? 'bg-gradient-to-r from-green-500 to-emerald-400' : ''}
              ${isQueued  ? 'bg-slate-600/40' : ''}
            `}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* ── Percentage + elapsed/total time ── */}
      <div className="text-right flex-shrink-0 w-20">
        <p className="text-xs font-bold font-mono text-slate-200 leading-none">{progress}%</p>
        <p className="text-[10px] font-mono text-slate-600 mt-0.5">
          {formatMs(elapsedMs)} / {formatMs(estimatedDurationMs)}
        </p>
      </div>

      {/* ── Simulated performance metric ── */}
      <div className="text-right flex-shrink-0 w-28">
        {isRunning ? (
          <>
            <p className="text-[9px] text-slate-600 uppercase tracking-wider">
              {metricType === 'cpu' ? 'Instructions' : 'Mem Throughput'}
            </p>
            <p className="text-xs font-mono font-bold text-cyan-400">
              {metricType === 'cpu'
                ? `${Math.round(metric)} M/s`
                : `${Number(metric).toFixed(1)} GB/s`}
            </p>
          </>
        ) : isDone ? (
          <p className="text-[10px] text-green-500 font-medium">Done ✓</p>
        ) : (
          <p className="text-[10px] text-slate-700">—</p>
        )}
      </div>
    </div>
  );
}
