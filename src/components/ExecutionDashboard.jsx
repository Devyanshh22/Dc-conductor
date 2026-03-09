import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  buildInitialState,
  tickExecution,
  buildResults,
  TICK_MS,
} from '../utils/executionEngine';
import GlobalMetricsBar      from './GlobalMetricsBar';
import MachineExecutionCard  from './MachineExecutionCard';
import TaskProgressRow       from './TaskProgressRow';
import CompletedQueue        from './CompletedQueue';

/**
 * ExecutionDashboard  (Step 4)
 *
 * Orchestrates the full execution simulation:
 *   1. Pre-flight checklist animation
 *   2. "Begin Execution" → starts the TICK_MS interval
 *   3. Live three-section layout (machine grid / active tasks / completed queue)
 *   4. Saves `schedulerResults` to localStorage when everything finishes
 *
 * Props:
 *   onProceed {function} - called when user clicks "Proceed to Output"
 */
export default function ExecutionDashboard({ onProceed }) {

  // ── Read localStorage data once ────────────────────────────────────────────
  const { assignments, machines } = useMemo(() => {
    const a = JSON.parse(localStorage.getItem('schedulerAssignments') || '[]');
    const m = JSON.parse(localStorage.getItem('schedulerMachines')    || '[]');
    return { assignments: a, machines: m };
  }, []);

  const scheduledCount  = assignments.filter(a => a.status === 'Scheduled').length;
  const onlineMachines  = machines.filter(m => m.status !== 'Offline');

  // ── Phase ─────────────────────────────────────────────────────────────────
  // 'preflight' → 'running' → 'done'
  const [phase, setPhase] = useState('preflight');

  // Pre-flight checklist: 0 = nothing shown, 1/2/3 = items revealed one-by-one
  const [checklistStep, setChecklistStep] = useState(0);

  // ── Execution state ────────────────────────────────────────────────────────
  const [execState, setExecState] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Refs for values needed synchronously inside the setInterval closure
  const elapsedRef  = useRef(0);
  const execStartMs = useRef(null);

  // ── Pre-flight stagger animation ───────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'preflight') return;
    const t1 = setTimeout(() => setChecklistStep(1), 300);
    const t2 = setTimeout(() => setChecklistStep(2), 750);
    const t3 = setTimeout(() => setChecklistStep(3), 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [phase]);

  // ── Begin Execution ────────────────────────────────────────────────────────
  const handleBeginExecution = useCallback(() => {
    const initial      = buildInitialState(assignments, machines);
    execStartMs.current = Date.now();
    elapsedRef.current  = 0;
    setExecState(initial);
    setElapsedMs(0);
    setPhase('running');
  }, [assignments, machines]);

  // ── Tick loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'running') return;

    const interval = setInterval(() => {
      elapsedRef.current += TICK_MS;
      const snap = elapsedRef.current;
      setElapsedMs(snap);
      setExecState(prev => {
        if (!prev) return prev;
        return tickExecution(prev, TICK_MS, snap);
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [phase]);

  // ── Detect global completion ───────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'running' || !execState) return;
    const tasks = Object.values(execState.taskStates);
    if (tasks.length > 0 && tasks.every(t => t.status === 'completed')) {
      setPhase('done');
      const results = buildResults(execState.taskStates, execStartMs.current ?? Date.now());
      localStorage.setItem('schedulerResults', JSON.stringify(results));
    }
  }, [execState, phase]);

  // ── Derived views ──────────────────────────────────────────────────────────
  const { taskStates, machineStates } = execState
    ?? { taskStates: {}, machineStates: {} };

  // Completed tasks (for bottom panel) — re-derived on every tick
  const completedTasks = useMemo(
    () => Object.values(taskStates).filter(t => t.status === 'completed'),
    [taskStates],
  );

  // Active tasks: running first (sorted by progress desc), then queued
  const activeTasks = useMemo(
    () =>
      Object.values(taskStates)
        .filter(t => t.status === 'running' || t.status === 'queued')
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === 'running' ? -1 : 1;
          return b.progress - a.progress;
        }),
    [taskStates],
  );

  // Ordered machine list (stable order from initial load)
  const machineList = useMemo(() => Object.values(machineStates), [machineStates]);

  const totalScheduled = Object.keys(taskStates).length;

  // ══════════════════════════════════════════════════════════════════════════
  // Pre-flight screen
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === 'preflight') {
    return (
      <div className="exec-fade-up flex justify-center pt-10 pb-16">
        <div className="w-full max-w-md bg-slate-800/60 rounded-2xl border border-slate-700 p-8">

          {/* Title */}
          <div className="mb-7">
            <h2 className="text-base font-bold text-slate-100">Execution Pre-Flight</h2>
            <p className="text-xs text-slate-500 mt-0.5">Verifying all systems before launch</p>
          </div>

          {/* Checklist items */}
          <div className="space-y-2 mb-7">
            <ChecklistItem
              visible={checklistStep >= 1}
              label="Tasks loaded"
              detail={`${scheduledCount} task${scheduledCount !== 1 ? 's' : ''} ready for execution`}
            />
            <ChecklistItem
              visible={checklistStep >= 2}
              label="Machines online"
              detail={`${onlineMachines.length} / ${machines.length} nodes available`}
            />
            <ChecklistItem
              visible={checklistStep >= 3}
              label="Assignments confirmed"
              detail={`${scheduledCount} task–machine assignments loaded`}
            />
          </div>

          {/* Ready banner + button */}
          {checklistStep >= 3 && (
            <div className="exec-checklist-enter">
              <div className="flex items-center gap-2 text-xs text-green-400 mb-4 bg-green-900/20 border border-green-700/30 rounded-lg px-3 py-2">
                <span className="text-sm flex-shrink-0">✓</span>
                <span className="font-medium">All systems ready — cleared for launch</span>
              </div>
              <button
                onClick={handleBeginExecution}
                className="
                  w-full py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98]
                  rounded-xl text-sm font-bold text-white transition-all duration-200
                  shadow-lg shadow-indigo-900/40 cursor-pointer
                "
              >
                Begin Execution
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Execution / Done screen
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="exec-fade-up space-y-6">

      {/* ── 1. Global Metrics Bar ── */}
      <GlobalMetricsBar
        taskStates={taskStates}
        machineStates={machineStates}
        elapsedMs={elapsedMs}
        phase={phase}
      />

      {/* ── 2. Live Machine Grid ── */}
      <section>
        <SectionHeader
          icon="🖥️"
          title="Live Machine Grid"
          badge={`${machineList.length} nodes`}
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {machineList.map(ms => (
            <MachineExecutionCard
              key={ms.machineId}
              machine={ms}
              allTaskStates={taskStates}
            />
          ))}
        </div>
      </section>

      {/* ── 3. Active Task Progress ── */}
      <section>
        <SectionHeader
          icon="⚙️"
          title="Active Task Progress"
          badge={activeTasks.length > 0 ? `${activeTasks.length} active` : undefined}
        />
        {activeTasks.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-slate-600 text-sm bg-slate-800/30 rounded-xl border border-slate-700/40">
            {phase === 'done'
              ? '✓ All tasks have completed execution'
              : 'No active tasks yet…'}
          </div>
        ) : (
          <div className="space-y-2">
            {activeTasks.map(task => (
              <TaskProgressRow key={task.taskId} task={task} />
            ))}
          </div>
        )}
      </section>

      {/* ── 4. Completed Tasks Holding Queue ── */}
      <section>
        <SectionHeader
          icon="📦"
          title="Completed — Awaiting Merge"
          badge={completedTasks.length > 0 ? `${completedTasks.length} / ${totalScheduled}` : undefined}
        />
        <CompletedQueue
          completedTasks={completedTasks}
          totalTasks={totalScheduled}
          onProceed={onProceed}
          phase={phase}
        />
      </section>

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, badge }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-sm leading-none">{icon}</span>
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{title}</h2>
      {badge !== undefined && (
        <span className="text-[10px] bg-slate-800/60 text-slate-500 border border-slate-700/40 px-2 py-0.5 rounded-full font-mono">
          {badge}
        </span>
      )}
      <div className="flex-1 h-px bg-slate-700/40 ml-1" />
    </div>
  );
}

/**
 * ChecklistItem
 * Renders a placeholder skeleton when !visible, or the real content with
 * the slide-in animation once visible=true.
 */
function ChecklistItem({ visible, label, detail }) {
  if (!visible) {
    return (
      <div className="h-[52px] rounded-lg bg-slate-700/20 border border-slate-700/30 animate-pulse" />
    );
  }
  return (
    <div className="exec-checklist-enter flex items-center gap-3 bg-slate-900/60 border border-green-700/25 rounded-lg px-4 py-3">
      <span className="text-green-400 text-base leading-none flex-shrink-0">✓</span>
      <div>
        <p className="text-sm font-medium text-slate-200 leading-none">{label}</p>
        <p className="text-[11px] text-slate-500 mt-1">{detail}</p>
      </div>
    </div>
  );
}
