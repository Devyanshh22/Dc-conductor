import { formatMs } from '../utils/executionEngine';

/**
 * MachineExecutionCard
 * Live server node card shown in the top grid of the Execution Dashboard.
 *
 * Props:
 *   machine       {object} - machineState from executionEngine
 *   allTaskStates {object} - full taskStates map (keyed by taskId)
 */

const STATUS_CONFIG = {
  offline:  {
    label:     'Offline',
    dot:       'bg-red-500/60',
    text:      'text-red-400/70',
    glowClass: '',
    opacity:   'opacity-40',
  },
  idle: {
    label:     'Idle',
    dot:       'bg-slate-500',
    text:      'text-slate-400',
    glowClass: '',
    opacity:   '',
  },
  running: {
    label:     'Running',
    dot:       'bg-blue-400 animate-pulse',
    text:      'text-blue-400',
    glowClass: 'machine-exec-running',
    opacity:   '',
  },
  complete: {
    label:     'Complete',
    dot:       'bg-green-400',
    text:      'text-green-400',
    glowClass: 'machine-exec-complete',
    opacity:   '',
  },
};

export default function MachineExecutionCard({ machine, allTaskStates }) {
  const {
    machineName,
    totalCpu, totalRam,
    usedCpu,  usedRam,
    status,
    completedCount,
    uptimeMs,
    runningTaskId,
    pendingQueue,
  } = machine;

  const sc          = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;
  const runningTask = runningTaskId ? allTaskStates[runningTaskId] : null;
  const cpuPct      = totalCpu > 0 ? Math.round((usedCpu / totalCpu) * 100) : 0;
  const ramPct      = totalRam > 0 ? Math.round((usedRam / totalRam) * 100) : 0;

  return (
    <div
      className={`
        relative overflow-hidden bg-slate-800/60 rounded-xl border border-slate-700/60 p-4
        flex flex-col gap-0 transition-all duration-300
        ${sc.glowClass} ${sc.opacity}
      `}
    >
      {/* ── Header: name + status ── */}
      <div className="flex items-start justify-between mb-3 gap-1">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-200 font-mono truncate">{machineName}</p>
          <p className="text-[10px] text-slate-600 mt-0.5">{totalCpu}c / {totalRam} GB</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sc.dot}`} />
          <span className={`text-[11px] font-medium ${sc.text}`}>{sc.label}</span>
        </div>
      </div>

      {/* ── Utilization bars ── */}
      <UtilBar label="CPU" used={usedCpu} total={totalCpu} pct={cpuPct} unit="c"  color="indigo" />
      <UtilBar label="RAM" used={usedRam} total={totalRam} pct={ramPct} unit="GB" color="purple" />

      {/* ── Running task chip (fixed height to avoid layout shift) ── */}
      <div className="mt-3 min-h-[52px]">
        {runningTask ? (
          <div className="bg-blue-950/50 border border-blue-700/40 rounded-lg p-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
              <span className="text-[11px] font-medium text-blue-200 truncate">
                {runningTask.taskName}
              </span>
            </div>
            {/* Mini progress bar */}
            <div className="h-1 bg-blue-900/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-400 rounded-full transition-all duration-200"
                style={{ width: `${runningTask.progress}%` }}
              />
            </div>
            <p className="text-[9px] font-mono text-blue-400/50 mt-0.5 text-right">
              {runningTask.progress}%
            </p>
          </div>
        ) : status === 'complete' ? (
          <div className="flex items-center justify-center h-full py-2">
            <span className="text-[11px] text-green-400/60">All tasks done ✓</span>
          </div>
        ) : status === 'running' ? (
          <div className="text-[10px] text-slate-600 italic pt-1">Preparing next task…</div>
        ) : status === 'idle' && pendingQueue.length === 0 ? (
          <div className="text-[10px] text-slate-700 pt-1">No tasks assigned</div>
        ) : null}
      </div>

      {/* ── Pending queue depth ── */}
      <div className="h-4 mt-1">
        {pendingQueue.length > 0 && (
          <p className="text-[10px] text-slate-600 font-mono">
            +{pendingQueue.length} task{pendingQueue.length !== 1 ? 's' : ''} queued
          </p>
        )}
      </div>

      {/* ── Footer: throughput + uptime ── */}
      {status !== 'offline' && (
        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-700/40">
          <div>
            <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">Throughput</p>
            <p className="text-sm font-bold font-mono text-slate-200 leading-none">
              {completedCount}
              <span className="text-[10px] text-slate-600 font-normal ml-0.5">done</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">Uptime</p>
            <p className="text-xs font-mono text-slate-400 leading-none">{formatMs(uptimeMs)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── UtilBar ───────────────────────────────────────────────────────────────────

function UtilBar({ label, used, total, pct, unit, color }) {
  const barColor = {
    indigo: pct > 70 ? 'bg-orange-500' : 'bg-indigo-500',
    purple: pct > 70 ? 'bg-orange-500' : 'bg-purple-500',
  }[color] ?? 'bg-indigo-500';

  return (
    <div className="mb-2">
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-[9px] text-slate-600 uppercase tracking-wider font-medium">
          {label}
        </span>
        <span className={`text-[9px] font-mono ${pct > 70 ? 'text-orange-400' : 'text-slate-600'}`}>
          {used}{unit}/{total}{unit}
        </span>
      </div>
      <div className="h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
