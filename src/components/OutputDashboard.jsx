import { useState, useEffect, useMemo } from 'react';
import { computeStats }     from '../utils/computeStats';
import { exportJSON, exportCSV } from '../utils/exportUtils';
import StatCards            from './StatCards';
import MachineBreakdown     from './MachineBreakdown';
import MathOutputCard       from './MathOutputCard';
import ImageOutputCard      from './ImageOutputCard';
import { saveResults, completeSession } from '../utils/apiClient';
import executionSocket      from '../utils/executionSocket';

/**
 * OutputDashboard  (Step 5)
 *
 * Sequence:
 *   1. 'merging'  — task cards animate in, compiler box pulses for ~2 s.
 *   2. 'done'     — full results panel with per-task Math/Image output cards,
 *                   stat cards, per-machine breakdown, export buttons.
 *
 * Props:
 *   onRestart  {function}
 *   sessionId  {string|null}
 *   showToast  {function}
 */
export default function OutputDashboard({ onRestart, sessionId, showToast }) {

  /* ── Load data once ─────────────────────────────────────────────────────── */
  const results = useMemo(
    () => JSON.parse(localStorage.getItem('schedulerResults') || '[]'),
    [],
  );

  /* schedulerTasks holds full task metadata (equation, imageData, etc.) */
  const tasks = useMemo(
    () => JSON.parse(localStorage.getItem('schedulerTasks') || '[]'),
    [],
  );

  const stats = useMemo(() => computeStats(results), [results]);

  /* Task lookup by id for output cards */
  const taskById = useMemo(() => {
    const m = {};
    tasks.forEach(t => { m[t.id] = t; });
    return m;
  }, [tasks]);

  /* ── Live math segments ─────────────────────────────────────────────────
     { [taskId]: { segments: [{machineId, points}], received, total } }
  ─────────────────────────────────────────────────────────────────────────── */
  const [liveSegments, setLiveSegments] = useState({});

  /* ── Live image strips ───────────────────────────────────────────────────
     { [taskId]: { strips: [{stripIndex, machineId, machineName, grayscaleStrip, duration}],
                   received, total, finalImage } }
  ─────────────────────────────────────────────────────────────────────────── */
  const [imageState, setImageState] = useState({});

  useEffect(() => {
    const unsubMath = executionSocket.onMathSegment(msg => {
      const { taskId, machineId, results, totalSegments = 1 } = msg;
      if (!taskId || !results) return;
      setLiveSegments(prev => {
        const entry = prev[taskId] ?? { segments: [], received: 0, total: totalSegments };
        if (entry.segments.some(s => s.machineId === machineId)) return prev;
        return {
          ...prev,
          [taskId]: {
            segments: [...entry.segments, { machineId, points: results }],
            received: entry.received + 1,
            total:    totalSegments,
          },
        };
      });
    });

    const unsubStrip = executionSocket.onImageStrip(msg => {
      const { taskId, machineId, machineName, stripIndex, totalStrips, grayscaleStrip, duration } = msg;
      if (!taskId) return;
      setImageState(prev => {
        const entry = prev[taskId] ?? { strips: [], received: 0, total: totalStrips ?? 1, finalImage: null };
        if (entry.strips.some(s => s.stripIndex === stripIndex)) return prev;
        return {
          ...prev,
          [taskId]: {
            ...entry,
            strips:   [...entry.strips, { stripIndex, machineId, machineName, grayscaleStrip, duration }],
            received: entry.received + 1,
            total:    totalStrips ?? entry.total,
          },
        };
      });
    });

    const unsubComplete = executionSocket.onImageComplete(msg => {
      const { taskId, finalImage } = msg;
      if (!taskId || !finalImage) return;
      setImageState(prev => ({
        ...prev,
        [taskId]: { ...(prev[taskId] ?? { strips: [], received: 0, total: 1 }), finalImage },
      }));
    });

    return () => { unsubMath(); unsubStrip(); unsubComplete(); };
  }, []);

  /* ── Merge animation ────────────────────────────────────────────────────── */
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

  /* ── Restart ────────────────────────────────────────────────────────────── */
  const handleRestart = () => {
    if (window.confirm(
      'Start a new session?\n\nThis will clear all tasks, machines, assignments, and results.',
    )) {
      ['schedulerTasks', 'schedulerMachines', 'schedulerAssignments', 'schedulerResults']
        .forEach(k => localStorage.removeItem(k));
      onRestart();
    }
  };

  /* ══════════════════════════════════════════════════════════════════════════
     1. MERGE ANIMATION
  ══════════════════════════════════════════════════════════════════════════ */
  if (phase === 'merging') {
    return (
      <div className="exec-fade-up flex flex-col items-center justify-center py-12 min-h-[480px] gap-0">

        <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-8">
          {mergeStep < 2 ? 'Aggregating results…' : 'Compilation complete!'}
        </p>

        {/* Task cards */}
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

        {/* Compiler box */}
        <div
          className={`
            flex flex-col items-center gap-3 transition-all duration-500
            ${mergeStep >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6 pointer-events-none'}
          `}
        >
          <div
            className={`
              w-[88px] h-[88px] rounded-2xl border-2 flex items-center justify-center
              transition-colors duration-300
              ${mergeStep === 1
                ? 'output-compiler-pulse border-indigo-500/70 bg-indigo-900/30'
                : 'border-green-500/60 bg-green-900/20'}
            `}
          >
            <span className={`text-3xl leading-none ${mergeStep === 1 ? 'output-spinner' : ''}`}>
              {mergeStep >= 2 ? '✅' : '⚙️'}
            </span>
          </div>
          <p className="text-sm text-slate-400 font-medium">
            {mergeStep < 2 ? 'Compiling results…' : 'Done — loading report…'}
          </p>
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

  /* ══════════════════════════════════════════════════════════════════════════
     2. NO RESULTS GUARD
  ══════════════════════════════════════════════════════════════════════════ */
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

  /* ══════════════════════════════════════════════════════════════════════════
     3. FULL OUTPUT DASHBOARD
  ══════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="exec-fade-up space-y-8 pb-10">

      {/* ── Header + export buttons ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 leading-tight">
            Output &amp; Results
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {stats.totalTasks} task{stats.totalTasks !== 1 ? 's' : ''} completed across{' '}
            {stats.uniqueMachineCount} machine{stats.uniqueMachineCount !== 1 ? 's' : ''} in{' '}
            {stats.totalWallClockS}s wall-clock time
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => exportJSON(results)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-blue-700 hover:bg-blue-600 text-white transition-colors cursor-pointer shadow-sm shadow-blue-900/40"
          >
            <span>⬇</span> Export JSON
          </button>
          <button
            onClick={() => exportCSV(stats.resultsWithRelTimes)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-green-700 hover:bg-green-600 text-white transition-colors cursor-pointer shadow-sm shadow-green-900/40"
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

      {/* ── Per-task output cards ── */}
      <section>
        <SectionHeader
          icon="🔬"
          title="Task Output"
          badge={`${results.length} result${results.length !== 1 ? 's' : ''}`}
        />
        <div className="space-y-4">
          {results.map(r => {
            const task = taskById[r.taskId];
            if (!task) return null;
            if (task.type === 'math') {
              const live = liveSegments[r.taskId];
              /* Prefer live WS segments, else use segments stored in the result */
              const segments = live?.segments.length > 0
                ? live.segments
                : (r.mathResults?.length > 0 ? [{ machineId: r.machineId, points: r.mathResults }] : undefined);
              const segmentProgress = live
                ? { received: live.received, total: live.total }
                : (segments?.length > 0 ? { received: 1, total: 1 } : null);
              return (
                <MathOutputCard
                  key={r.taskId}
                  task={task}
                  result={r}
                  segments={segments}
                  segmentProgress={segmentProgress}
                />
              );
            }
            const imgState = imageState[r.taskId];
            const imageStrips      = imgState?.strips ?? [];
            const imageFinalImage  = imgState?.finalImage ?? null;
            const imageStripProgress = imgState
              ? { received: imgState.received, total: imgState.total }
              : (r.grayscaleData ? { received: 1, total: 1 } : null);
            return (
              <ImageOutputCard
                key={r.taskId}
                task={task}
                result={r}
                strips={imageStrips}
                finalImage={imageFinalImage}
                stripProgress={imageStripProgress}
              />
            );
          })}
        </div>
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

function SectionHeader({ icon, title, badge }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-sm leading-none">{icon}</span>
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{title}</h3>
      {badge !== undefined && (
        <span className="text-[10px] bg-slate-800/60 text-slate-500 border border-slate-700/40 px-2 py-0.5 rounded-full font-mono">
          {badge}
        </span>
      )}
      <div className="flex-1 h-px bg-slate-700/40 ml-1" />
    </div>
  );
}
