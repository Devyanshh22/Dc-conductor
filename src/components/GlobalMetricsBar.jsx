import { computeGlobalMetrics, formatMs } from '../utils/executionEngine';

/**
 * GlobalMetricsBar
 * Sticky summary strip at the top of the Execution Dashboard showing
 * live counts, overall progress, elapsed time, and ETA.
 *
 * Props:
 *   taskStates    {object}  - keyed by taskId
 *   machineStates {object}  - keyed by machineId
 *   elapsedMs     {number}  - wall-clock ms since execution began
 *   phase         {string}  - 'running' | 'done'
 *   wsStatus      {string}  - 'connecting' | 'connected' | 'disconnected' | null
 */
export default function GlobalMetricsBar({ taskStates, machineStates, elapsedMs, phase, wsStatus = null }) {
  const { total, completed, running, queued, overallProgress, etaMs } =
    computeGlobalMetrics(taskStates, machineStates);

  const isDone = phase === 'done';

  return (
    <div
      className={`
        rounded-xl border p-4 mb-6 transition-colors duration-500
        ${isDone
          ? 'bg-green-950/40 border-green-700/40'
          : 'bg-slate-800/80 border-slate-700/60'}
        backdrop-blur-sm
      `}
    >
      <div className="flex flex-wrap items-center gap-3">

        {/* ── Stat chips ── */}
        <StatChip
          label="Total"
          value={total}
          color="text-slate-200"
          bg="bg-slate-900/60 border-slate-700/50"
        />
        <StatChip
          label="Running"
          value={running}
          color={running > 0 ? 'text-blue-400' : 'text-slate-500'}
          bg="bg-slate-900/60 border-slate-700/50"
          pulse={running > 0}
        />
        <StatChip
          label="Queued"
          value={queued}
          color={queued > 0 ? 'text-yellow-400' : 'text-slate-500'}
          bg="bg-slate-900/60 border-slate-700/50"
        />
        <StatChip
          label="Done"
          value={completed}
          color={completed > 0 ? 'text-green-400' : 'text-slate-500'}
          bg={completed === total && total > 0
            ? 'bg-green-900/30 border-green-700/40'
            : 'bg-slate-900/60 border-slate-700/50'}
        />

        {/* ── Master progress bar (fills remaining space) ── */}
        <div className="flex-1 min-w-[180px]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
              Overall Progress
            </span>
            <span className="text-xs font-bold font-mono text-slate-200">
              {overallProgress}%
            </span>
          </div>
          <div className="h-2.5 bg-slate-700/60 rounded-full overflow-hidden">
            <div
              className={`
                h-full rounded-full transition-all duration-200
                ${isDone
                  ? 'bg-gradient-to-r from-green-500 to-emerald-400'
                  : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400'}
              `}
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>

        {/* ── Time stats ── */}
        <div className="flex items-center gap-4 shrink-0">
          <TimeBlock
            label="Elapsed"
            value={formatMs(elapsedMs)}
            color="text-slate-200"
          />

          {!isDone && etaMs > 0 && (
            <TimeBlock
              label="ETA"
              value={formatMs(etaMs)}
              color="text-yellow-300"
            />
          )}

          {isDone && (
            <div className="flex items-center gap-1.5 bg-green-900/30 border border-green-700/40 px-3 py-2 rounded-lg">
              <span className="text-green-400 text-base leading-none">✓</span>
              <span className="text-green-400 text-xs font-semibold">All Complete</span>
            </div>
          )}

          {/* ── WebSocket status indicator ── */}
          {wsStatus !== null && <WsStatusChip status={wsStatus} />}
        </div>

      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatChip({ label, value, color, bg, pulse = false }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${bg}`}>
      <span className={`text-lg font-bold font-mono leading-none ${color} ${pulse ? 'animate-pulse' : ''}`}>
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
        {label}
      </span>
    </div>
  );
}

function TimeBlock({ label, value, color }) {
  return (
    <div className="text-center">
      <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-0.5">{label}</p>
      <p className={`text-sm font-mono font-bold ${color}`}>{value}</p>
    </div>
  );
}

function WsStatusChip({ status }) {
  const cfg = {
    connected:    { dot: 'bg-green-400',  text: 'text-green-400',  label: 'Live',           border: 'border-green-700/40',  bg: 'bg-green-900/20'  },
    connecting:   { dot: 'bg-yellow-400 animate-pulse', text: 'text-yellow-300', label: 'Connecting…', border: 'border-yellow-700/40', bg: 'bg-yellow-900/10' },
    disconnected: { dot: 'bg-red-400',    text: 'text-red-400',    label: 'Disconnected',   border: 'border-red-700/40',    bg: 'bg-red-900/20'    },
  }[status] ?? { dot: 'bg-slate-500', text: 'text-slate-400', label: status, border: 'border-slate-700', bg: 'bg-slate-800/40' };

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold ${cfg.bg} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      <span className={cfg.text}>{cfg.label}</span>
    </div>
  );
}
