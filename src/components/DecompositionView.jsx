import { useState, useEffect, useMemo } from 'react';
import { decomposeTasks, getAffinityAssignments } from '../utils/taskDecomposer';
import { saveSubTasks } from '../utils/apiClient';

/* ── Affinity colour palette ─────────────────────────────────────────── */
const AFFINITY_STYLE = {
  Arithmetic: {
    bg:     'bg-blue-900/30',
    border: 'border-blue-500/40',
    text:   'text-blue-300',
    chip:   'bg-blue-900/50 border border-blue-500/50 text-blue-300',
    dot:    'bg-blue-400',
  },
  Memory: {
    bg:     'bg-purple-900/30',
    border: 'border-purple-500/40',
    text:   'text-purple-300',
    chip:   'bg-purple-900/50 border border-purple-500/50 text-purple-300',
    dot:    'bg-purple-400',
  },
  Compute: {
    bg:     'bg-indigo-900/30',
    border: 'border-indigo-500/40',
    text:   'text-indigo-300',
    chip:   'bg-indigo-900/50 border border-indigo-500/50 text-indigo-300',
    dot:    'bg-indigo-400',
  },
  'I/O': {
    bg:     'bg-teal-900/30',
    border: 'border-teal-500/40',
    text:   'text-teal-300',
    chip:   'bg-teal-900/50 border border-teal-500/50 text-teal-300',
    dot:    'bg-teal-400',
  },
  Render: {
    bg:     'bg-orange-900/30',
    border: 'border-orange-500/40',
    text:   'text-orange-300',
    chip:   'bg-orange-900/50 border border-orange-500/50 text-orange-300',
    dot:    'bg-orange-400',
  },
};

const DEFAULT_STYLE = {
  bg:     'bg-slate-700/30',
  border: 'border-slate-600',
  text:   'text-slate-300',
  chip:   'bg-slate-700 border border-slate-600 text-slate-300',
  dot:    'bg-slate-400',
};

function afStyle(opType) { return AFFINITY_STYLE[opType] ?? DEFAULT_STYLE; }

const PRIORITY_DOT = {
  Critical: 'bg-red-500',
  High:     'bg-orange-500',
  Medium:   'bg-yellow-500',
  Low:      'bg-green-500',
};

/* ── Component ───────────────────────────────────────────────────────── */
export default function DecompositionView({ onProceed, sessionId, showToast }) {
  /* ── Load data from localStorage ── */
  const tasks = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('schedulerTasks')) || []; }
    catch { return []; }
  }, []);

  const machines = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('schedulerMachines')) || []; }
    catch { return []; }
  }, []);

  const machineById = useMemo(
    () => Object.fromEntries(machines.map(m => [m.id, m])),
    [machines],
  );

  /* ── Phase state: 'idle' | 'decomposing' | 'done' ── */
  const [phase,         setPhase]         = useState('idle');
  const [revealedCount, setRevealedCount] = useState(0);
  const [subTasks,      setSubTasks]      = useState([]);
  const [affinityMap,   setAffinityMap]   = useState({});

  /* ── Group sub-tasks under their parent for display ── */
  const parentGroups = useMemo(() => tasks.map(t => ({
    ...t,
    subs: subTasks.filter(s => s.parentTaskId === t.id),
  })), [tasks, subTasks]);

  /* ── Animation: reveal one task group every 480 ms ── */
  useEffect(() => {
    if (phase !== 'decomposing') return;
    if (revealedCount >= tasks.length) { setPhase('done'); return; }
    const timer = setTimeout(() => setRevealedCount(c => c + 1), 480);
    return () => clearTimeout(timer);
  }, [phase, revealedCount, tasks.length]);

  /* ── Start decomposition ── */
  function startDecomposition() {
    if (phase !== 'idle') return;
    const flat                            = decomposeTasks(tasks);
    const { subTasks: stamped, affinityMap: aMap } = getAffinityAssignments(flat, machines);
    setSubTasks(stamped);
    setAffinityMap(aMap);
    setRevealedCount(0);
    setPhase('decomposing');
  }

  /* ── Proceed → save to localStorage + backend ── */
  async function handleProceed() {
    localStorage.setItem('schedulerSubTasks',    JSON.stringify(subTasks));
    localStorage.setItem('schedulerAffinityMap', JSON.stringify(affinityMap));
    if (sessionId) {
      await saveSubTasks(sessionId, subTasks);
      showToast?.('Sub-tasks saved ✓');
    }
    onProceed();
  }

  const isDecomposing   = phase === 'decomposing';
  const isDone          = phase === 'done';
  const affinityEntries = Object.entries(affinityMap);

  return (
    <div className="step-enter grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6 items-start">

      {/* ══════════════ LEFT — Decomposition panel ══════════════ */}
      <div className="flex flex-col gap-5">

        {/* Header row */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-violet-400" />
              Task Decomposition
              <span className="text-xs font-normal text-slate-500">
                ({tasks.length} tasks · {tasks.length * 3} sub-tasks)
              </span>
            </h2>
            <p className="text-[11px] text-slate-600 mt-0.5 ml-4">
              Each task is decomposed into typed sub-tasks with affinity-based machine routing.
            </p>
          </div>

          {/* Action pill */}
          {phase === 'idle' && (
            <button
              onClick={startDecomposition}
              disabled={tasks.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold
                bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white
                shadow-lg shadow-violet-900/30 transition-all duration-150
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Decompose Tasks
            </button>
          )}

          {isDecomposing && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold
              bg-violet-700/60 text-violet-200 cursor-wait">
              <span className="w-2 h-2 rounded-full bg-violet-300 animate-ping" />
              Decomposing… {revealedCount}/{tasks.length}
            </div>
          )}

          {isDone && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold
              bg-green-900/30 border border-green-500/40 text-green-300">
              ✓ Decomposition Complete
            </div>
          )}
        </div>

        {/* Task / sub-task list */}
        <div className="flex flex-col gap-4">
          {tasks.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-8">
              No tasks found. Return to Phase 1 to add tasks.
            </p>
          )}

          {parentGroups.map((group, idx) => {
            const revealed = isDone || (isDecomposing && idx < revealedCount);
            const style    = afStyle(group.operationType);

            return (
              <div
                key={group.id}
                className={`rounded-xl border transition-all duration-300 overflow-hidden
                  ${revealed
                    ? `${style.border} ${style.bg}`
                    : 'border-slate-700 bg-slate-800/50'
                  }`}
              >
                {/* Parent task header */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="text-[10px] text-slate-600 font-mono w-4 flex-shrink-0 text-right">
                    {idx + 1}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate transition-colors duration-300
                      ${revealed ? style.text : 'text-slate-400'}`}>
                      {group.name}
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono">
                      {group.cpu}c · {group.ram} GB · {group.duration}s
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Priority dot */}
                    <span
                      className={`w-2 h-2 rounded-full ${PRIORITY_DOT[group.priority] ?? 'bg-slate-500'}`}
                      title={group.priority}
                    />

                    {/* Operation type chip */}
                    {group.operationType && (
                      <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full
                        ${revealed ? style.chip : 'bg-slate-700 border border-slate-600 text-slate-500'}`}>
                        {group.operationType}
                      </span>
                    )}

                    {/* Expand indicator */}
                    <span className={`text-[10px] font-mono transition-colors duration-300
                      ${revealed ? style.text : 'text-slate-600'}`}>
                      {revealed ? '▼' : '▷'}
                    </span>
                  </div>
                </div>

                {/* Sub-task rows (animated in when revealed) */}
                {revealed && group.subs.length > 0 && (
                  <div className="px-4 pb-3 pt-2 border-t border-slate-700/50 flex flex-col gap-1.5">
                    {group.subs.map((sub, si) => {
                      const prefMachine = sub.preferredMachineId
                        ? machineById[sub.preferredMachineId]
                        : null;

                      return (
                        <div
                          key={sub.id}
                          className="banner-enter flex items-center gap-2.5 rounded-lg
                            bg-slate-800/70 border border-slate-700/60 px-3 py-2"
                        >
                          {/* Index bubble */}
                          <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center
                            justify-center text-[9px] font-bold ${style.chip}`}>
                            {si + 1}
                          </span>

                          {/* Name + resources */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-200 truncate">
                              {sub.name}
                            </p>
                            <p className="text-[9px] text-slate-500 font-mono">
                              {sub.cpu}c · {sub.ram} GB · {sub.duration}s
                            </p>
                          </div>

                          {/* Preferred machine hint */}
                          {prefMachine && (
                            <span className="text-[9px] font-mono text-slate-500 flex-shrink-0">
                              → {prefMachine.name}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Decomposition complete banner */}
        {isDone && (
          <div className="banner-enter flex items-center gap-3 rounded-xl
            bg-violet-900/20 border border-violet-500/30 px-4 py-3">
            <span className="text-violet-400 text-xl flex-shrink-0">⚙</span>
            <p className="text-sm text-violet-200 leading-snug">
              <span className="font-bold">Decomposition complete.</span>{' '}
              {subTasks.length} sub-tasks generated across{' '}
              {affinityEntries.length} affinity group{affinityEntries.length !== 1 ? 's' : ''}.
              Affinity hints have been assigned — proceed to matching.
            </p>
          </div>
        )}

        {/* Proceed button */}
        <div className="border-t border-slate-700 pt-4">
          <button
            onClick={handleProceed}
            disabled={!isDone}
            className={`w-full rounded-xl font-semibold py-3 text-sm transition-all duration-200 shadow-lg
              ${isDone
                ? 'bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white shadow-purple-900/40'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
          >
            {isDone ? '→ Proceed to Matching' : 'Decompose tasks first to proceed'}
          </button>
        </div>
      </div>

      {/* ══════════════ RIGHT — Affinity Routing panel ══════════════ */}
      <div className="bg-slate-800/40 rounded-2xl border border-slate-700 p-5">
        <h3 className="text-sm font-bold text-slate-300 mb-1 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />
          Affinity Routing
        </h3>
        <p className="text-[10px] text-slate-600 mb-4">
          Best machine per operation type, used as a scheduling preference hint.
        </p>

        {/* Placeholder when not yet computed */}
        {!isDone && (
          <div className="flex flex-col items-center justify-center py-10 text-slate-600 text-center gap-2">
            <span className="text-3xl opacity-30">↔</span>
            <p className="text-xs">Routes computed after decomposition.</p>
          </div>
        )}

        {/* Affinity map entries */}
        {isDone && affinityEntries.length > 0 && (
          <div className="banner-enter flex flex-col gap-3">
            {affinityEntries.map(([opType, machineId]) => {
              const machine = machineById[machineId];
              const style   = afStyle(opType);

              return (
                <div
                  key={opType}
                  className={`rounded-xl border px-3 py-2.5 ${style.bg} ${style.border}`}
                >
                  {/* Operation type label */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${style.text}`}>
                      {opType}
                    </span>
                    <span className="text-[10px] text-slate-600">↓</span>
                  </div>

                  {/* Assigned machine */}
                  {machine ? (
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot} flex-shrink-0`} />
                      <div>
                        <p className="text-xs font-semibold text-slate-200">{machine.name}</p>
                        <p className="text-[9px] text-slate-500 font-mono">
                          {machine.cpu}c · {machine.ram} GB · {machine.type}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No machine available</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Sub-task stats (after decomposition) */}
        {isDone && subTasks.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-700 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Sub-task Summary
            </p>

            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-slate-800 rounded-lg py-2 border border-slate-700">
                <p className="text-[9px] text-slate-500 uppercase font-semibold mb-0.5">Total</p>
                <p className="text-sm font-mono font-bold text-slate-200">{subTasks.length}</p>
              </div>
              <div className="bg-slate-800 rounded-lg py-2 border border-slate-700">
                <p className="text-[9px] text-slate-500 uppercase font-semibold mb-0.5">Groups</p>
                <p className="text-sm font-mono font-bold text-slate-200">{affinityEntries.length}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-slate-800 rounded-lg py-2 border border-slate-700">
                <p className="text-[9px] text-slate-500 uppercase font-semibold mb-0.5">CPU</p>
                <p className="text-sm font-mono font-bold text-slate-200">
                  {subTasks.reduce((s, t) => s + t.cpu, 0)}c
                </p>
              </div>
              <div className="bg-slate-800 rounded-lg py-2 border border-slate-700">
                <p className="text-[9px] text-slate-500 uppercase font-semibold mb-0.5">RAM</p>
                <p className="text-sm font-mono font-bold text-slate-200">
                  {subTasks.reduce((s, t) => s + t.ram, 0)} GB
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
