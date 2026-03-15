import { useState, useEffect, useMemo } from 'react';
import { computeStats }   from '../utils/computeStats';
import { exportJSON, exportCSV } from '../utils/exportUtils';
import ResultsTable       from './ResultsTable';
import StatCards          from './StatCards';
import MachineBreakdown   from './MachineBreakdown';
import { saveResults, completeSession } from '../utils/apiClient';

/**
 * OutputDashboard  (Step 5)
 *
 * Sequence:
 *   1. 'merging'  — task cards animate in from the left, then funnel into
 *                   a compiler box that pulses for ~2 s.
 *   2. 'done'     — full results panel: stat cards, sortable table,
 *                   per-machine breakdown, export buttons, restart.
 *
 * Props:
 *   onRestart {function}  Called after the user confirms "Start New Session".
 *                         The caller (App) resets all React state.
 */
export default function OutputDashboard({ onRestart, sessionId, showToast }) {

  // ── Load data once ─────────────────────────────────────────────────────────
  const results = useMemo(
    () => JSON.parse(localStorage.getItem('schedulerResults') || '[]'),
    [],
  );

  const stats = useMemo(() => computeStats(results), [results]);

  // ── Merge animation phase ──────────────────────────────────────────────────
  // mergeStep: 0 = cards visible | 1 = compiler active | 2 = compiler done
  const [mergeStep, setMergeStep] = useState(0);
  const [phase,     setPhase]     = useState('merging');

  useEffect(() => {
    const t1 = setTimeout(() => setMergeStep(1), 900);
    const t2 = setTimeout(() => setMergeStep(2), 2900);
    const t3 = setTimeout(async () => {
      setPhase('done');
      if (sessionId && results.length > 0) {
        await saveResults(sessionId, results);
        await completeSession(sessionId);
        showToast?.('Session saved ✓');
      }
    }, 3100);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [sessionId, results, showToast]);

  // ── Restart with confirmation ──────────────────────────────────────────────
  const handleRestart = () => {
    if (window.confirm(
      'Start a new session?\n\nThis will clear all tasks, machines, assignments, and results.'
    )) {
      ['schedulerTasks', 'schedulerMachines', 'schedulerAssignments', 'schedulerResults']
        .forEach(k => localStorage.removeItem(k));
      onRestart();
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 1. Merge animation screen
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === 'merging') {
    return (
      <div className="exec-fade-up flex flex-col items-center justify-center py-12 min-h-[480px] gap-0">

        {/* Status label */}
        <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-8">
          {mergeStep < 2 ? 'Aggregating results…' : 'Compilation complete!'}
        </p>

        {/* ── Task cards (fade out when compiler appears) ── */}
        <div
          className={`
            flex flex-wrap justify-center gap-2 max-w-xl w-full mb-8
            transition-all duration-600
            ${mergeStep >= 1 ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}
          `}
        >
          {results.map((r, i) => (
            <div
              key={r.taskId}
              className="output-card-fly bg-slate-800/70 border border-green-700/30 rounded-lg px-3 py-2 flex items-center gap-2"
              style={{ animationDelay: `${i * 140}ms` }}
            >
              <span className="text-green-400 text-xs flex-shrink-0">✓</span>
              <span className="text-slate-300 text-xs font-medium">{r.taskName}</span>
              <span className="text-[10px] text-slate-600 font-mono">{r.machineName}</span>
            </div>
          ))}
        </div>

        {/* ── Compiler box (appears after cards, fades in) ── */}
        <div
          className={`
            flex flex-col items-center gap-3
            transition-all duration-500
            ${mergeStep >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6 pointer-events-none'}
          `}
        >
          <div
            className={`
              w-22 h-22 w-[88px] h-[88px] rounded-2xl border-2 flex items-center justify-center
              transition-colors duration-300
              ${mergeStep === 1
                ? 'output-compiler-pulse border-indigo-500/70 bg-indigo-900/30'
                : mergeStep >= 2
                ? 'border-green-500/60 bg-green-900/20'
                : 'border-slate-700 bg-slate-800/60'}
            `}
          >
            <span
              className={`text-3xl leading-none ${mergeStep === 1 ? 'output-spinner' : ''}`}
            >
              {mergeStep >= 2 ? '✅' : '⚙️'}
            </span>
          </div>
          <p className="text-sm text-slate-400 font-medium">
            {mergeStep < 2 ? 'Compiling results…' : 'Done — loading report…'}
          </p>

          {/* Progress dots */}
          {mergeStep === 1 && (
            <div className="flex gap-1.5 mt-1">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"
                  style={{ animationDelay: `${i * 200}ms` }}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. Guard: no results
  // ══════════════════════════════════════════════════════════════════════════
  if (!stats) {
    return (
      <div className="exec-fade-up flex flex-col items-center justify-center py-32 gap-4 text-center">
        <span className="text-5xl opacity-40">📭</span>
        <p className="text-slate-500 text-sm">
          No results found. Please complete Phase 4 first.
        </p>
        <button
          onClick={handleRestart}
          className="mt-2 px-5 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors cursor-pointer"
        >
          ↩ Start New Session
        </button>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. Full Output Dashboard
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="exec-fade-up space-y-8 pb-10">

      {/* ── Page header + export buttons ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 leading-tight">
            Output &amp; Results
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {stats.totalTasks} tasks completed across {stats.uniqueMachineCount} machines
            in {stats.totalWallClockS}s wall-clock time
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => exportJSON(results)}
            className="
              flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold
              bg-blue-700 hover:bg-blue-600 text-white
              transition-colors duration-150 cursor-pointer
              shadow-sm shadow-blue-900/40
            "
          >
            <span>⬇</span> Export JSON
          </button>
          <button
            onClick={() => exportCSV(stats.resultsWithRelTimes)}
            className="
              flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold
              bg-green-700 hover:bg-green-600 text-white
              transition-colors duration-150 cursor-pointer
              shadow-sm shadow-green-900/40
            "
          >
            <span>⬇</span> Export CSV
          </button>
        </div>
      </div>

      {/* ── Summary statistics ── */}
      <section>
        <SectionHeader icon="📈" title="Summary Statistics" />
        <StatCards stats={stats} />
      </section>

      {/* ── Sortable results table ── */}
      <section>
        <SectionHeader
          icon="📋"
          title="Task Results"
          badge={`${stats.totalTasks} rows · click headers to sort`}
        />
        <ResultsTable results={stats.resultsWithRelTimes} />
      </section>

      {/* ── Per-machine breakdown ── */}
      <section>
        <SectionHeader
          icon="🖥️"
          title="Per-Machine Breakdown"
          badge="click to expand"
        />
        <MachineBreakdown machineBreakdown={stats.machineBreakdown} />
      </section>

      {/* ── Start New Session ── */}
      <div className="flex justify-center pt-4">
        <button
          onClick={handleRestart}
          className="
            px-8 py-3 rounded-xl text-sm font-semibold
            bg-slate-800 hover:bg-red-950/60 border border-slate-700
            hover:border-red-700/50 text-slate-400 hover:text-red-300
            transition-all duration-200 cursor-pointer
          "
        >
          🔄 Start New Session
        </button>
      </div>

    </div>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, badge }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-sm leading-none">{icon}</span>
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
        {title}
      </h3>
      {badge !== undefined && (
        <span className="text-[10px] bg-slate-800/60 text-slate-500 border border-slate-700/40 px-2 py-0.5 rounded-full font-mono">
          {badge}
        </span>
      )}
      <div className="flex-1 h-px bg-slate-700/40 ml-1" />
    </div>
  );
}
