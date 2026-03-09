import { useState } from 'react';

/**
 * MachineBreakdown
 * Collapsible per-machine execution summary.
 * Shows tasks in sequential order with CPU·s, RAM·GB·s consumed, and idle time.
 *
 * Props:
 *   machineBreakdown {Array}  machineBreakdown from computeStats()
 */
export default function MachineBreakdown({ machineBreakdown }) {
  return (
    <div className="space-y-2">
      {machineBreakdown.map(machine => (
        <MachineSection key={machine.machineId} machine={machine} />
      ))}
    </div>
  );
}

// ── MachineSection ────────────────────────────────────────────────────────────

function MachineSection({ machine }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-slate-700/60 overflow-hidden">

      {/* ── Collapsible header ── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="
          w-full flex items-center justify-between gap-4
          px-4 py-3 bg-slate-800/50 hover:bg-slate-800/80
          transition-colors duration-150 text-left
        "
      >
        {/* Left: name + task count */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-bold font-mono text-slate-200 truncate">
            {machine.machineName}
          </span>
          <span className="
            text-[10px] text-slate-500 bg-slate-700/50 border border-slate-600/40
            px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0
          ">
            {machine.tasks.length} task{machine.tasks.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Right: summary stats + chevron */}
        <div className="flex items-center gap-5 flex-shrink-0">
          <SummaryPill label="CPU·s"    value={machine.totalCpuSeconds} />
          <SummaryPill label="RAM·GB·s" value={machine.totalRamSeconds} />
          <SummaryPill label="Idle"     value={`${machine.idleTime}s`} />
          <span className="text-slate-500 text-xs ml-1 select-none">
            {open ? '▲' : '▼'}
          </span>
        </div>
      </button>

      {/* ── Expandable content ── */}
      {open && (
        <div className="border-t border-slate-700/40 bg-slate-900/40 p-4">

          {/* Mobile stat row (hidden on sm+, already visible in header) */}
          <div className="grid grid-cols-3 gap-2 mb-4 sm:hidden">
            <MiniStat label="CPU·s"    value={machine.totalCpuSeconds} />
            <MiniStat label="RAM·GB·s" value={machine.totalRamSeconds} />
            <MiniStat label="Idle"     value={`${machine.idleTime}s`} />
          </div>

          {/* Timeline header */}
          <p className="text-[9px] uppercase tracking-widest text-slate-600 mb-2">
            Execution order
          </p>

          {/* Task list */}
          <div className="space-y-1.5">
            {machine.tasks.map((task, idx) => (
              <TaskLine key={task.taskId} task={task} index={idx} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── TaskLine ──────────────────────────────────────────────────────────────────

function TaskLine({ task, index }) {
  return (
    <div className="
      flex flex-wrap items-center gap-x-4 gap-y-1
      bg-slate-800/50 rounded-lg px-3 py-2
    ">
      {/* Index */}
      <span className="text-[10px] text-slate-600 font-mono w-4 flex-shrink-0">
        {index + 1}.
      </span>

      {/* Name */}
      <span className="text-xs font-semibold text-slate-200 flex-1 min-w-[120px]">
        {task.taskName}
      </span>

      {/* CPU */}
      <span className="text-[10px] font-mono text-indigo-400 flex-shrink-0">
        {task.cpuAllocated}c
      </span>

      {/* RAM */}
      <span className="text-[10px] font-mono text-purple-400 flex-shrink-0">
        {task.ramAllocated} GB
      </span>

      {/* Time range */}
      <span className="text-[10px] font-mono text-slate-500 flex-shrink-0">
        {task.startRelS}s → {task.endRelS}s
      </span>

      {/* Duration */}
      <span className="text-[10px] font-mono font-bold text-cyan-400 flex-shrink-0">
        {task.actualDuration}s
      </span>
    </div>
  );
}

// ── Helper sub-components ─────────────────────────────────────────────────────

function SummaryPill({ label, value }) {
  return (
    <div className="text-center hidden sm:block">
      <p className="text-[8px] uppercase tracking-widest text-slate-600">{label}</p>
      <p className="text-[11px] font-mono text-slate-400">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="bg-slate-800/50 rounded-lg px-2 py-1.5 text-center border border-slate-700/40">
      <p className="text-[8px] uppercase tracking-widest text-slate-600">{label}</p>
      <p className="text-xs font-mono text-slate-300">{value}</p>
    </div>
  );
}
