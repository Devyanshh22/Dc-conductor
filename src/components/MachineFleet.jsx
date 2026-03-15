import { useState, useEffect, useMemo } from 'react';
import MachineCard from './MachineCard';
import { MACHINES } from '../data/machines';
import { saveMachines } from '../utils/apiClient';

const PRIORITY_DOT = {
  Critical: 'bg-red-500',
  High:     'bg-orange-500',
  Medium:   'bg-yellow-500',
  Low:      'bg-green-500',
};

export default function MachineFleet({ onProceed, sessionId, showToast }) {
  /* Mutable machine list — user can toggle online/offline */
  const [machines, setMachines] = useState(() => MACHINES.map(m => ({ ...m })));

  /* ── Scan state machine ──────────────────────────────────────────────
     scanIdx: -1 = not started | 0..N-1 = scanning card at that index
     scanDone: true once all cards have been scanned                    */
  const [scanIdx,  setScanIdx]  = useState(-1);
  const [scanDone, setScanDone] = useState(false);

  useEffect(() => {
    if (scanIdx < 0 || scanDone) return;
    if (scanIdx >= machines.length) {
      setScanDone(true);
      setScanIdx(-1);
      return;
    }
    const t = setTimeout(() => setScanIdx(i => i + 1), 460);
    return () => clearTimeout(t);
  }, [scanIdx, scanDone, machines.length]);

  function startScan() {
    if (scanDone || scanIdx >= 0) return;
    setScanIdx(0);
  }

  /* Toggle machine online ↔ offline. Resets scan so user re-scans
     to reflect the updated fleet configuration.                    */
  function handleToggle(id) {
    setMachines(prev => prev.map(m => {
      if (m.id !== id) return m;
      const next = m.status === 'Offline' ? 'Idle' : 'Offline';
      return {
        ...m,
        status: next,
        uptime: next === 'Offline' ? '—' : (m.uptime === '—' ? '0h 00m' : m.uptime),
      };
    }));
    /* Reset scan — fleet changed, a fresh scan gives accurate results */
    setScanDone(false);
    setScanIdx(-1);
  }

  async function handleProceed() {
    localStorage.setItem('schedulerMachines', JSON.stringify(machines));
    if (sessionId) {
      await saveMachines(sessionId, machines);
      showToast?.('Machines saved ✓');
    }
    onProceed();
  }

  /* Derived scan helpers */
  const isScanning = scanIdx >= 0 && !scanDone;

  function cardIsScanning(idx) { return !scanDone && scanIdx === idx; }
  function cardIsScanned(idx)  { return scanDone || (scanIdx >= 0 && idx < scanIdx); }

  /* Fleet summary (online machines only) */
  const onlineMachines = machines.filter(m => m.status !== 'Offline');
  const totalCores = onlineMachines.reduce((s, m) => s + m.cpu, 0);
  const totalRAM   = onlineMachines.reduce((s, m) => s + m.ram, 0);
  const maxSingleCpu = onlineMachines.length > 0 ? Math.max(...onlineMachines.map(m => m.cpu)) : 0;
  const maxSingleRam = onlineMachines.length > 0 ? Math.max(...onlineMachines.map(m => m.ram)) : 0;

  /* Tasks from Phase 1 localStorage */
  const tasks = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('schedulerTasks')) || []; }
    catch { return []; }
  }, []);

  const taskCores = tasks.reduce((s, t) => s + (t.cpu || 0), 0);
  const taskRAM   = tasks.reduce((s, t) => s + (t.ram || 0), 0);

  return (
    <div className="step-enter grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6 items-start">

      {/* ══════════════ LEFT — Fleet panel ══════════════ */}
      <div className="flex flex-col gap-5">

        {/* Header row */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-400" />
              Machine Fleet
              <span className="text-xs font-normal text-slate-500">
                ({machines.length} nodes · {onlineMachines.length} online)
              </span>
            </h2>
            <p className="text-[11px] text-slate-600 mt-0.5 ml-4">
              Toggle machines online or offline to simulate fleet changes, then scan.
            </p>
          </div>

          {/* Scan button */}
          <button
            onClick={startScan}
            disabled={scanDone || isScanning}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold
              transition-all duration-150
              ${isScanning
                ? 'bg-indigo-700/60 text-indigo-200 cursor-wait'
                : scanDone
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-lg shadow-indigo-900/30'
              }
            `}
          >
            {isScanning ? (
              <>
                <span className="w-2 h-2 rounded-full bg-indigo-300 animate-ping" />
                Scanning…
              </>
            ) : scanDone ? (
              '✓ Scan Complete'
            ) : (
              '⟳ Scan Machines'
            )}
          </button>
        </div>

        {/* Machine card grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {machines.map((machine, idx) => (
            <MachineCard
              key={machine.id}
              machine={machine}
              isScanning={cardIsScanning(idx)}
              isScanned={cardIsScanned(idx)}
              onToggle={handleToggle}
            />
          ))}
        </div>

        {/* Scan complete banner */}
        {scanDone && (
          <div className="banner-enter flex items-center gap-3 rounded-xl bg-blue-900/25 border border-blue-500/35 px-4 py-3">
            <span className="text-xl flex-shrink-0">📡</span>
            <p className="text-sm text-blue-200 leading-snug">
              <span className="font-bold">Scan complete.</span>{' '}
              {onlineMachines.length} machine{onlineMachines.length !== 1 ? 's' : ''} online.{' '}
              Total available:{' '}
              <span className="font-mono font-bold text-blue-100">{totalCores} cores</span>,{' '}
              <span className="font-mono font-bold text-blue-100">{totalRAM} GB</span> RAM.
            </p>
          </div>
        )}

        {/* Proceed button */}
        <div className="border-t border-slate-700 pt-4">
          <button
            onClick={handleProceed}
            disabled={!scanDone}
            className={`
              w-full rounded-xl font-semibold py-3 text-sm transition-all duration-200 shadow-lg
              ${scanDone
                ? 'bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white shadow-purple-900/40'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }
            `}
          >
            {scanDone ? '→ Proceed to Matching' : 'Scan machines first to proceed'}
          </button>
        </div>
      </div>

      {/* ══════════════ RIGHT — Task summary sidebar ══════════════ */}
      <div className="bg-slate-800/40 rounded-2xl border border-slate-700 p-5">
        <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
          Queued Tasks
          <span className="text-slate-500 font-normal">({tasks.length})</span>
        </h3>

        {/* Task list */}
        <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-0.5">
          {tasks.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-6">
              No tasks loaded from localStorage.
            </p>
          ) : (
            tasks.map((task, i) => (
              <div
                key={task.id || i}
                className="flex items-center gap-2 p-2 rounded-lg bg-slate-800 border border-slate-700/60"
              >
                <span className="text-[10px] text-slate-600 font-mono w-4 flex-shrink-0 text-right">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-200 truncate">{task.name}</p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    {task.cpu}c · {task.ram} GB · {task.duration}s
                  </p>
                </div>
                <span
                  className={`
                    flex-shrink-0 w-2 h-2 rounded-full
                    ${PRIORITY_DOT[task.priority] ?? 'bg-slate-500'}
                  `}
                  title={task.priority}
                />
              </div>
            ))
          )}
        </div>

        {/* Totals */}
        {tasks.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-700 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Total Demand
            </p>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-slate-800 rounded-lg py-2 border border-slate-700">
                <p className="text-[10px] text-slate-500 uppercase font-semibold mb-0.5">CPU</p>
                <p className="text-sm font-mono font-bold text-slate-200">{taskCores} cores</p>
              </div>
              <div className="bg-slate-800 rounded-lg py-2 border border-slate-700">
                <p className="text-[10px] text-slate-500 uppercase font-semibold mb-0.5">RAM</p>
                <p className="text-sm font-mono font-bold text-slate-200">{taskRAM} GB</p>
              </div>
            </div>

            {/* Demand vs supply indicator (shown after scan) */}
            {scanDone && (
              <div className="banner-enter rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Capacity Check
                </p>
                <CapacityRow label="CPU" demand={taskCores} supply={totalCores} />
                <CapacityRow label="RAM" demand={taskRAM}   supply={totalRAM}   unit="GB" />
                {(taskCores > totalCores || taskRAM > totalRAM) && (
                  <p className="text-[10px] text-amber-400 mt-1">
                    Total demand exceeds fleet — some tasks may be unschedulable.
                  </p>
                )}
                {/* Split threshold notice */}
                <div className="pt-1 mt-1 border-t border-slate-700">
                  <p className="text-[10px] text-slate-500">
                    Split threshold:{' '}
                    <span className="font-mono text-slate-400">{maxSingleCpu}c / {maxSingleRam} GB</span>
                    {' '}(largest node). Tasks above this are auto-split.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* Inline capacity comparison row */
function CapacityRow({ label, demand, supply, unit = 'cores' }) {
  const ok = supply >= demand;
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-500 font-mono">{label}</span>
      <span className={`font-mono font-semibold ${ok ? 'text-green-400' : 'text-amber-400'}`}>
        {demand} / {supply} {unit}
        <span className="ml-1.5">{ok ? '✓' : '~'}</span>
      </span>
    </div>
  );
}
