import { useState, useCallback, useEffect } from 'react';
import TaskForm           from './components/TaskForm';
import TaskQueue          from './components/TaskQueue';
import StepIndicator      from './components/StepIndicator';
import MachineFleet       from './components/MachineFleet';
import DecompositionView  from './components/DecompositionView';
import MatchingEngine     from './components/MatchingEngine';
import ExecutionDashboard from './components/ExecutionDashboard';
import OutputDashboard    from './components/OutputDashboard';
import SessionHistory     from './components/SessionHistory';
import { sortTasks }      from './utils/prioritySort';
import { createSession }  from './utils/apiClient';
import './index.css';

const STEP_SUBTITLE = {
  1:   'Task Input & Priority Queue',
  2:   'Machine Fleet',
  2.5: 'Task Decomposition',
  3:   'Task Matching & Assignment',
  4:   'Execution Monitor',
  5:   'Output & Results',
};

export default function App() {
  /* ── Phase 1 state ─────────────────────────────────────────────── */
  const [tasks,  setTasks]  = useState([]);
  const [locked, setLocked] = useState(false);

  /* ── Step navigation ───────────────────────────────────────────── */
  const [step, setStep] = useState(1);

  /* ── Session persistence ───────────────────────────────────────── */
  const [sessionId,   setSessionId]   = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  /* ── Toast notification ────────────────────────────────────────── */
  const [toast, setToast] = useState(null);   /* null | string */

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  /* Create a backend session on first mount */
  useEffect(() => {
    createSession().then(data => {
      if (data?.sessionId) {
        setSessionId(data.sessionId);
        localStorage.setItem('currentSessionId', String(data.sessionId));
      }
    });
  }, []);

  const sortedTasks = sortTasks(tasks);

  const handleAddTask = useCallback((task) => {
    setTasks(prev => [...prev, task]);
  }, []);

  const handleRemoveTask = useCallback((id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  /* Step 1 → Step 2: lock queue + save to localStorage */
  const handleProceed = useCallback(() => {
    const sorted = sortTasks(tasks);
    localStorage.setItem('schedulerTasks', JSON.stringify(sorted));
    setLocked(true);
    setTimeout(() => setStep(2), 750);
  }, [tasks]);

  /* Step 2 → Step 2.5 */
  const handleProceedToDecomposition = useCallback(() => setStep(2.5), []);

  /* Step 2.5 → Step 3 */
  const handleProceedToMatching = useCallback(() => setStep(3), []);

  /* Step 3 → Step 4 */
  const handleProceedToExecution = useCallback(() => setStep(4), []);

  /* Step 5 → Step 1: full reset */
  const handleRestart = useCallback(() => {
    setTasks([]);
    setLocked(false);
    setStep(1);
  }, []);

  /* Restore a historical session — populate localStorage, jump to step 5 */
  function handleRestore(sessionDetail) {
    const { tasks: dbTasks = [], machines: dbMachines = [],
            assignments: dbAssignments = [], results: dbResults = [] } = sessionDetail;

    localStorage.setItem('schedulerTasks', JSON.stringify(
      dbTasks.map(t => ({
        id: t.task_id, name: t.name,
        cpu: t.cpu_required, ram: t.ram_required,
        priority: t.priority, duration: t.estimated_duration,
        operationType: t.operation_type,
      }))
    ));
    localStorage.setItem('schedulerMachines', JSON.stringify(
      dbMachines.map(m => ({
        id: m.machine_id, name: m.name,
        cpu: m.cpu_total, ram: m.ram_total,
        status: m.status, type: m.type,
      }))
    ));
    localStorage.setItem('schedulerAssignments', JSON.stringify(
      dbAssignments.map(a => ({
        taskId: a.task_id, taskName: a.task_name,
        machineId: a.machine_id, machineName: a.machine_name,
        cpuAllocated: a.cpu_allocated, ramAllocated: a.ram_allocated,
        estimatedDuration: a.estimated_duration, status: a.status,
        parentTaskId: a.parent_task_id,
      }))
    ));
    localStorage.setItem('schedulerResults', JSON.stringify(
      dbResults.map(r => ({
        taskId: r.task_id, taskName: r.task_name,
        machineId: r.machine_id, machineName: r.machine_name,
        cpuAllocated: r.cpu_allocated, ramAllocated: r.ram_allocated,
        startTime: r.start_time, endTime: r.end_time,
        actualDuration: r.actual_duration, status: r.status,
        parentTaskId: r.parent_task_id,
      }))
    ));

    setShowHistory(false);
    setStep(5);
  }

  /* ── Header status indicator ───────────────────────────────────── */
  const headerStatus =
    step === 1
      ? locked
        ? { text: 'Queue Locked',    dot: 'bg-green-400' }
        : { text: 'Accepting Tasks', dot: 'bg-indigo-400 animate-pulse' }
      : step === 2
      ? { text: 'Fleet Active',      dot: 'bg-blue-400 animate-pulse' }
      : step === 2.5
      ? { text: 'Decomposing',       dot: 'bg-violet-400 animate-pulse' }
      : step === 3
      ? { text: 'Matching Tasks',    dot: 'bg-purple-400 animate-pulse' }
      : step === 4
      ? { text: 'Executing',         dot: 'bg-blue-400 animate-pulse' }
      : { text: 'Results Ready',     dot: 'bg-green-400' };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">

      {/* ── Sticky header + step indicator ── */}
      <header className="border-b border-slate-700/60 bg-slate-900/90 backdrop-blur-sm sticky top-0 z-10">

        {/* Top row */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <div>
            <h1 className="text-sm font-bold text-slate-100 leading-tight tracking-tight">
              Conductor
            </h1>
            <p className="text-[11px] text-slate-500">
              Phase {step} — {STEP_SUBTITLE[step] ?? 'In Progress'}
            </p>
          </div>

          {/* Session indicator */}
          {sessionId && (
            <span className="hidden sm:inline-flex items-center text-[10px] font-mono
              text-slate-500 border border-slate-700 px-2.5 py-0.5 rounded-full">
              Session #{sessionId} active
            </span>
          )}

          {/* Right: History button + status */}
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                font-semibold bg-slate-700 hover:bg-slate-600 text-slate-300
                transition-colors border border-slate-600"
            >
              <span className="text-[11px]">🗂</span>
              History
            </button>

            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${headerStatus.dot}`} />
              <span className="text-xs text-slate-400 font-medium">
                {headerStatus.text}
              </span>
            </div>
          </div>
        </div>

        {/* Step indicator row */}
        <div className="border-t border-slate-700/40 px-4 sm:px-6 py-3">
          <StepIndicator currentStep={step} />
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* Step 1: Task Queue */}
        {step === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">

            <div className="lg:sticky lg:top-36">
              <TaskForm onAddTask={handleAddTask} locked={locked} />

              <div className="mt-4 bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                  Priority Legend
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Critical', cls: 'bg-red-500' },
                    { label: 'High',     cls: 'bg-orange-500' },
                    { label: 'Medium',   cls: 'bg-yellow-500' },
                    { label: 'Low',      cls: 'bg-green-500' },
                  ].map(({ label, cls }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cls}`} />
                      <span className="text-xs text-slate-400">{label}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-600 mt-3">
                  Within same priority, sorted by CPU (descending).
                </p>
              </div>
            </div>

            <div className="bg-slate-800/40 rounded-2xl border border-slate-700 p-6 min-h-[600px] flex flex-col">
              <TaskQueue
                tasks={sortedTasks}
                onRemove={handleRemoveTask}
                onProceed={handleProceed}
                locked={locked}
                sessionId={sessionId}
                showToast={showToast}
              />
            </div>
          </div>
        )}

        {/* Step 2: Machine Fleet */}
        {step === 2 && (
          <MachineFleet
            onProceed={handleProceedToDecomposition}
            sessionId={sessionId}
            showToast={showToast}
          />
        )}

        {/* Step 2.5: Task Decomposition */}
        {step === 2.5 && (
          <DecompositionView
            onProceed={handleProceedToMatching}
            sessionId={sessionId}
            showToast={showToast}
          />
        )}

        {/* Step 3: Matching Engine */}
        {step === 3 && (
          <MatchingEngine
            onProceed={handleProceedToExecution}
            sessionId={sessionId}
            showToast={showToast}
          />
        )}

        {/* Step 4: Execution Dashboard */}
        {step === 4 && (
          <ExecutionDashboard
            onProceed={() => setStep(5)}
            sessionId={sessionId}
            showToast={showToast}
          />
        )}

        {/* Step 5: Output Dashboard */}
        {step === 5 && (
          <OutputDashboard
            onRestart={handleRestart}
            sessionId={sessionId}
            showToast={showToast}
          />
        )}
      </main>

      {/* ── Toast notification ── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 banner-enter flex items-center gap-2
          px-4 py-2.5 rounded-xl bg-green-900/95 border border-green-500/60
          text-green-200 text-sm font-semibold shadow-xl shadow-black/50">
          ✓ {toast}
        </div>
      )}

      {/* ── Session History overlay ── */}
      {showHistory && (
        <SessionHistory
          onClose={() => setShowHistory(false)}
          onRestore={handleRestore}
        />
      )}
    </div>
  );
}
