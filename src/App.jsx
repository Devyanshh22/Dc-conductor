import { useState, useCallback } from 'react';
import TaskForm from './components/TaskForm';
import TaskQueue from './components/TaskQueue';
import StepIndicator from './components/StepIndicator';
import MachineFleet from './components/MachineFleet';
import MatchingEngine       from './components/MatchingEngine';
import ExecutionDashboard  from './components/ExecutionDashboard';
import OutputDashboard     from './components/OutputDashboard';
import { sortTasks } from './utils/prioritySort';
import './index.css';

const STEP_SUBTITLE = {
  1: 'Task Input & Priority Queue',
  2: 'Machine Fleet',
  3: 'Task Matching & Assignment',
  4: 'Execution Monitor',
  5: 'Output & Results',
};

export default function App() {
  /* ── Phase 1 state (unchanged) ───────────────────────────────── */
  const [tasks,  setTasks]  = useState([]);
  const [locked, setLocked] = useState(false);

  /* ── Step navigation ─────────────────────────────────────────── */
  const [step, setStep] = useState(1);

  const sortedTasks = sortTasks(tasks);

  const handleAddTask = useCallback((task) => {
    setTasks(prev => [...prev, task]);
  }, []);

  const handleRemoveTask = useCallback((id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  /* Lock queue → save to localStorage → transition to step 2 */
  const handleProceed = useCallback(() => {
    const sorted = sortTasks(tasks);
    localStorage.setItem('schedulerTasks', JSON.stringify(sorted));
    setLocked(true);
    // Brief delay so the "Queue locked" banner is visible before transition
    setTimeout(() => setStep(2), 750);
  }, [tasks]);

  /* Step 2 → Step 3 */
  const handleProceedToMatching = useCallback(() => {
    setStep(3);
  }, []);

  /* Step 3 → Step 4 */
  const handleProceedToExecution = useCallback(() => {
    setStep(4);
  }, []);

  /* Step 5 → Step 1: clear all state + localStorage */
  const handleRestart = useCallback(() => {
    setTasks([]);
    setLocked(false);
    setStep(1);
  }, []);

  /* ── Header status indicator ─────────────────────────────────── */
  const headerStatus =
    step === 1
      ? locked
        ? { text: 'Queue Locked',    dot: 'bg-green-400' }
        : { text: 'Accepting Tasks', dot: 'bg-indigo-400 animate-pulse' }
      : step === 2
      ? { text: 'Fleet Active',      dot: 'bg-blue-400 animate-pulse' }
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
          <div className="flex items-center gap-2">
            <div>
              <h1 className="text-sm font-bold text-slate-100 leading-tight tracking-tight">
                Conductor
              </h1>
              <p className="text-[11px] text-slate-500">
                Phase {step} — {STEP_SUBTITLE[step] ?? 'In Progress'}
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${headerStatus.dot}`} />
            <span className="text-xs text-slate-400 font-medium">
              {headerStatus.text}
            </span>
          </div>
        </div>

        {/* Step indicator row */}
        <div className="border-t border-slate-700/40 px-4 sm:px-6 py-3">
          <StepIndicator currentStep={step} />
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* ── Step 1: Task Queue ── */}
        {step === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">

            {/* Left: form + legend */}
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

            {/* Right: queue */}
            <div className="bg-slate-800/40 rounded-2xl border border-slate-700 p-6 min-h-[600px] flex flex-col">
              <TaskQueue
                tasks={sortedTasks}
                onRemove={handleRemoveTask}
                onProceed={handleProceed}
                locked={locked}
              />
            </div>
          </div>
        )}

        {/* ── Step 2: Machine Fleet ── */}
        {step === 2 && (
          <MachineFleet onProceed={handleProceedToMatching} />
        )}

        {/* ── Step 3: Matching Engine ── */}
        {step === 3 && (
          <MatchingEngine onProceed={handleProceedToExecution} />
        )}

        {/* ── Step 4: Execution Dashboard ── */}
        {step === 4 && (
          <ExecutionDashboard onProceed={() => setStep(5)} />
        )}

        {/* ── Step 5: Output Dashboard ── */}
        {step === 5 && (
          <OutputDashboard onRestart={handleRestart} />
        )}
      </main>
    </div>
  );
}
