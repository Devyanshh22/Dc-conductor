import { useState, useRef, useCallback, useMemo } from 'react';
import ConnectorCanvas from './ConnectorCanvas';
import { runBFD } from '../utils/bfdAlgorithm';

/* ─── constants ─────────────────────────────────────────────────────────── */

const SPEED_OPTS = [
  { label: 'Slow (1×)',   value: 1 },
  { label: 'Normal (2×)', value: 2 },
  { label: 'Fast (4×)',   value: 4 },
];

const PRI_DOT = {
  Critical: 'bg-red-500',
  High:     'bg-orange-500',
  Medium:   'bg-yellow-500',
  Low:      'bg-green-500',
};

const PRI_CHIP = {
  Critical: 'bg-red-500 text-white',
  High:     'bg-orange-500 text-white',
  Medium:   'bg-yellow-400 text-black',
  Low:      'bg-green-500 text-white',
};

/* ─── main component ────────────────────────────────────────────────────── */

export default function MatchingEngine({ onProceed }) {
  const [tasks]    = useState(() => JSON.parse(localStorage.getItem('schedulerTasks')    || '[]'));
  const [machines] = useState(() => JSON.parse(localStorage.getItem('schedulerMachines') || '[]'));

  /* Pre-compute BFD trace + split info once */
  const bfd = useMemo(() => runBFD(tasks, machines), [tasks, machines]);
  const { sortedTasks, trace, splitRegistry } = bfd;

  /* Speed — kept in both state (UI) and ref (async loop reads latest instantly) */
  const [speed, setSpeed] = useState(2);
  const speedRef          = useRef(2);

  /* Phase: idle | running | done */
  const [phase, setPhase] = useState('idle');

  /* Animation highlight state */
  const [anim, setAnim] = useState({
    activeTaskId:        null,
    evaluatingMachineId: null,
    rejectedMachineIds:  [],
    acceptedMachineId:   null,
    splitAnimParentId:   null,   /* non-null while the "splitting" flash is showing */
  });

  /* Live machine resource state (updated during animation) */
  const [machineStates, setMachineStates] = useState(() => {
    const s = {};
    machines.forEach(m => {
      s[m.id] = {
        availCpu:      m.status === 'Offline' ? 0 : m.cpu,
        availRam:      m.status === 'Offline' ? 0 : m.ram,
        assignedTasks: [],
      };
    });
    return s;
  });

  /* Assignments revealed so far (grows one-by-one during animation) */
  const [liveAssignments, setLiveAssignments] = useState([]);

  const cancelRef = useRef(false);

  /* Promise-based delay scaled by speed */
  const delay = useCallback(
    (ms) => new Promise(r => setTimeout(r, ms / speedRef.current)),
    []
  );

  /* ── Animation loop ─────────────────────────────────────────────────── */
  const startMatching = useCallback(async () => {
    cancelRef.current = false;
    setPhase('running');

    const shownSplitParents = new Set();

    for (let t = 0; t < sortedTasks.length; t++) {
      if (cancelRef.current) break;
      const task  = sortedTasks[t];
      const entry = trace[t];

      /* ── Extra step for the FIRST chunk of a split task:
            show "splitting" pulse on the parent group header ── */
      if (task.parentTaskId && task.chunkIndex === 1 && !shownSplitParents.has(task.parentTaskId)) {
        shownSplitParents.add(task.parentTaskId);

        setAnim({
          activeTaskId:        null,
          evaluatingMachineId: null,
          rejectedMachineIds:  [],
          acceptedMachineId:   null,
          splitAnimParentId:   task.parentTaskId,
        });
        await delay(750);
        if (cancelRef.current) break;

        setAnim(prev => ({ ...prev, splitAnimParentId: null }));
        await delay(200);
        if (cancelRef.current) break;
      }

      /* ── Step A: highlight the task / chunk ── */
      setAnim({
        activeTaskId:        task.id,
        evaluatingMachineId: null,
        rejectedMachineIds:  [],
        acceptedMachineId:   null,
        splitAnimParentId:   null,
      });
      await delay(550);
      if (cancelRef.current) break;

      /* ── Steps B + C: evaluate each machine ── */
      const rejectedIds = [];
      for (const ev of entry.machineEvals) {
        if (cancelRef.current) break;

        setAnim(prev => ({
          ...prev,
          evaluatingMachineId: ev.machineId,
          rejectedMachineIds:  rejectedIds,
        }));
        await delay(380);
        if (cancelRef.current) break;

        if (!ev.fits) {
          rejectedIds.push(ev.machineId);
          setAnim(prev => ({
            ...prev,
            evaluatingMachineId: null,
            rejectedMachineIds:  [...rejectedIds],
          }));
          await delay(220);
        }
      }
      if (cancelRef.current) break;

      if (entry.assignedMachineId) {
        /* ── Green acceptance glow ── */
        setAnim(prev => ({
          ...prev,
          evaluatingMachineId: null,
          acceptedMachineId:   entry.assignedMachineId,
        }));
        await delay(600);
        if (cancelRef.current) break;

        /* ── Update machine bars + add chip ── */
        const finalAssignment = bfd.assignments[t];
        setMachineStates(prev => {
          const next = { ...prev };
          const ms   = next[entry.assignedMachineId];
          next[entry.assignedMachineId] = {
            ...ms,
            availCpu:      ms.availCpu - task.cpu,
            availRam:      ms.availRam - task.ram,
            assignedTasks: [
              ...ms.assignedTasks,
              {
                id:       task.id,
                name:     task.name,
                cpu:      task.cpu,
                ram:      task.ram,
                priority: task.priority,
                isChunk:  !!task.parentTaskId,
              },
            ],
          };
          return next;
        });
        setLiveAssignments(prev => [...prev, finalAssignment]);
        await delay(350);

      } else {
        /* Unschedulable */
        setAnim(prev => ({ ...prev, evaluatingMachineId: null, acceptedMachineId: null }));
        setLiveAssignments(prev => [...prev, bfd.assignments[t]]);
        await delay(350);
      }

      if (cancelRef.current) break;

      /* ── Clear + pause before next task ── */
      setAnim({ activeTaskId: null, evaluatingMachineId: null, rejectedMachineIds: [], acceptedMachineId: null, splitAnimParentId: null });
      await delay(650);
    }

    if (!cancelRef.current) {
      setPhase('done');
      localStorage.setItem('schedulerAssignments', JSON.stringify(bfd.assignments));
    }
  }, [sortedTasks, trace, bfd.assignments, delay]);

  /* ── Connector visibility ── */
  const connectorToId    = anim.evaluatingMachineId ?? anim.acceptedMachineId;
  const connectorColor   = anim.acceptedMachineId ? 'accepted' : 'evaluating';
  const connectorVisible = phase === 'running' && !!anim.activeTaskId && !!connectorToId;

  /* ── Build display groups for task queue column ──
     Chunks from the same parent are grouped under a parent header.
     Regular tasks appear standalone.                                ── */
  const displayGroups = useMemo(() => {
    const groups   = [];
    const seenPars = new Set();
    for (const task of sortedTasks) {
      if (task.parentTaskId) {
        if (!seenPars.has(task.parentTaskId)) {
          seenPars.add(task.parentTaskId);
          groups.push({
            type:           'split',
            parentTaskId:   task.parentTaskId,
            parentTaskName: task.parentTaskName,
            totalChunks:    task.totalChunks,
            priority:       task.priority,
            chunks:         sortedTasks.filter(t => t.parentTaskId === task.parentTaskId),
          });
        }
      } else {
        groups.push({ type: 'regular', task });
      }
    }
    return groups;
  }, [sortedTasks]);

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div className="step-enter flex flex-col gap-6">

      {/* ── Controls bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wide mr-1">Speed:</span>
          {SPEED_OPTS.map(opt => (
            <button
              key={opt.label}
              onClick={() => { setSpeed(opt.value); speedRef.current = opt.value; }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                speed === opt.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {opt.label}
            </button>
          ))}

          {/* Split legend badge */}
          {Object.keys(splitRegistry).length > 0 && (
            <span className="ml-3 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/30">
              {Object.keys(splitRegistry).length} task{Object.keys(splitRegistry).length !== 1 ? 's' : ''} will be split
            </span>
          )}
        </div>

        {phase === 'idle' && (
          <button
            onClick={startMatching}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-sm shadow-lg shadow-indigo-900/30 transition-all"
          >
            ▶ Start Matching
          </button>
        )}

        {phase === 'running' && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping inline-block" />
            BFD matching in progress…
          </div>
        )}

        {phase === 'done' && (
          <span className="text-sm text-green-400 font-semibold">✓ Matching complete</span>
        )}
      </div>

      {/* ── Split panels ── */}
      <div className="grid grid-cols-[290px_1fr] gap-5">

        {/* ══ LEFT — Task Queue ══ */}
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
            Task Queue ({sortedTasks.length})
          </h3>

          {displayGroups.map(group => {
            if (group.type === 'regular') {
              return (
                <RegularTaskCard
                  key={group.task.id}
                  task={group.task}
                  anim={anim}
                  liveAssignments={liveAssignments}
                />
              );
            }
            /* Split group */
            return (
              <SplitGroupCard
                key={group.parentTaskId}
                group={group}
                anim={anim}
                liveAssignments={liveAssignments}
              />
            );
          })}
        </div>

        {/* ══ RIGHT — Machine Fleet ══ */}
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
            Machine Fleet
          </h3>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {machines.map(machine => {
              const ms         = machineStates[machine.id];
              const isOffline  = machine.status === 'Offline';
              const isEval     = anim.evaluatingMachineId === machine.id;
              const isRejected = !isEval && anim.rejectedMachineIds.includes(machine.id);
              const isAccepted = anim.acceptedMachineId === machine.id;
              const isFull     = !isOffline && ms.availCpu === 0 && ms.availRam === 0;

              const cpuPct = isOffline ? 0 : (ms.availCpu / machine.cpu) * 100;
              const ramPct = isOffline ? 0 : (ms.availRam / machine.ram) * 100;

              let cls = 'relative rounded-xl border p-4 transition-all duration-300 ';
              if      (isAccepted) cls += 'machine-accepted border-green-500/60  bg-slate-800 ';
              else if (isEval)     cls += 'machine-evaluating border-indigo-500/60 bg-slate-800 ';
              else if (isRejected) cls += 'machine-rejected border-red-500/40    bg-slate-800 ';
              else if (isOffline)  cls += 'border-slate-700 bg-slate-800/30 opacity-45 ';
              else if (isFull)     cls += 'border-slate-600 bg-slate-800/50 ';
              else                 cls += 'border-slate-700 bg-slate-800/60 ';

              return (
                <div key={machine.id} data-card-id={machine.id} className={cls}>

                  {/* Header */}
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <span className="font-mono font-bold text-slate-100 text-sm tracking-wide">
                      {machine.name}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold flex-shrink-0 ${
                      isOffline ? 'bg-red-500/15 text-red-300 border-red-500/30'
                      : isFull  ? 'bg-slate-600/40 text-slate-400 border-slate-600/40'
                      :           'bg-green-500/15 text-green-300 border-green-500/30'
                    }`}>
                      {isOffline ? 'Offline' : isFull ? 'Full' : 'Idle'}
                    </span>
                  </div>

                  {/* CPU bar */}
                  <div className="mb-1.5">
                    <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-1">
                      <span>CPU</span>
                      <span>{ms.availCpu} / {machine.cpu} cores</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                        style={{ width: `${cpuPct}%` }}
                      />
                    </div>
                  </div>

                  {/* RAM bar */}
                  <div className="mb-2">
                    <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-1">
                      <span>RAM</span>
                      <span>{ms.availRam} / {machine.ram} GB</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-purple-500 transition-all duration-700"
                        style={{ width: `${ramPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Assigned task chips */}
                  {ms.assignedTasks.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-2 border-t border-slate-700/50">
                      {ms.assignedTasks.map(t => (
                        <span
                          key={t.id}
                          className={`chip-pop text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            t.isChunk ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' : PRI_CHIP[t.priority]
                          }`}
                          title={`${t.cpu}c · ${t.ram} GB${t.isChunk ? ' (chunk)' : ''}`}
                        >
                          {t.name.length > 13 ? t.name.slice(0, 13) + '…' : t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Connector SVG overlay */}
      <ConnectorCanvas
        fromId={anim.activeTaskId}
        toId={connectorToId}
        color={connectorColor}
        visible={connectorVisible}
      />

      {/* Summary panel (after done) */}
      {phase === 'done' && (
        <SummaryPanel
          assignments={bfd.assignments}
          splitRegistry={splitRegistry}
          onProceed={onProceed}
        />
      )}
    </div>
  );
}

/* ─── RegularTaskCard ────────────────────────────────────────────────────── */

function RegularTaskCard({ task, anim, liveAssignments }) {
  const assignment  = liveAssignments.find(a => a.taskId === task.id);
  const isActive    = anim.activeTaskId === task.id;
  const isDone      = !!assignment;
  const isScheduled = isDone && assignment.status === 'Scheduled';

  return (
    <div
      data-card-id={task.id}
      className={`
        relative rounded-xl border p-3 transition-all duration-300
        ${isActive                           ? 'task-highlighting border-yellow-500/60 bg-slate-800 z-10' : ''}
        ${!isActive && isScheduled           ? 'border-green-500/25  bg-slate-800/40 opacity-55' : ''}
        ${!isActive && isDone && !isScheduled ? 'border-red-500/35   bg-red-900/10' : ''}
        ${!isActive && !isDone               ? 'border-slate-700    bg-slate-800/60' : ''}
      `}
    >
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRI_DOT[task.priority]}`} />
        <span className="text-xs font-semibold text-slate-200 truncate flex-1">{task.name}</span>
      </div>
      <div className="flex gap-3 mt-1.5">
        <span className="text-[10px] font-mono text-slate-500">{task.cpu}c</span>
        <span className="text-[10px] font-mono text-slate-500">{task.ram} GB</span>
        <span className="text-[10px] font-mono text-slate-500">{task.duration}s</span>
      </div>
      {isDone && (
        <p className={`text-[10px] font-bold mt-1.5 ${isScheduled ? 'text-green-400' : 'text-red-400'}`}>
          {isScheduled ? `✓ → ${assignment.machineName}` : '✗ Unschedulable'}
        </p>
      )}
    </div>
  );
}

/* ─── SplitGroupCard ─────────────────────────────────────────────────────── */

function SplitGroupCard({ group, anim, liveAssignments }) {
  const { parentTaskId, parentTaskName, totalChunks, priority, chunks } = group;

  const isSplitAnimating = anim.splitAnimParentId === parentTaskId;

  /* Count how many chunks have been processed / actually scheduled */
  const processedChunks = chunks.filter(c =>
    liveAssignments.some(a => a.taskId === c.id)
  );
  const scheduledChunks = chunks.filter(c =>
    liveAssignments.some(a => a.taskId === c.id && a.status === 'Scheduled')
  );
  const allDone       = processedChunks.length === totalChunks;
  const allScheduled  = scheduledChunks.length === totalChunks;

  return (
    <div
      className={`
        rounded-xl border transition-all duration-300
        ${isSplitAnimating
          ? 'task-splitting border-orange-500/60 bg-slate-800'
          : allDone
          ? 'border-orange-500/20 bg-slate-800/30'
          : 'border-orange-500/30 bg-slate-800/50'}
      `}
    >
      {/* ── Parent header ── */}
      <div className="px-3 pt-2.5 pb-2 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRI_DOT[priority]}`} />
          <span className="text-xs font-semibold text-slate-200 truncate flex-1">
            {parentTaskName}
          </span>
          <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/30">
            {isSplitAnimating ? 'splitting…' : `${totalChunks}× split`}
          </span>
        </div>
        {isSplitAnimating && (
          <p className="text-[10px] text-orange-400 mt-1 ml-4">
            Exceeds single-machine capacity — splitting proportionally across {totalChunks} nodes
          </p>
        )}
        {allDone && allScheduled && (
          <p className="text-[10px] text-green-400 mt-1 ml-4 font-medium">
            ✓ All {totalChunks} chunks scheduled
          </p>
        )}
        {allDone && !allScheduled && (
          <p className="text-[10px] text-amber-400 mt-1 ml-4 font-medium">
            {scheduledChunks.length}/{totalChunks} chunks scheduled · {totalChunks - scheduledChunks.length} unschedulable
          </p>
        )}
      </div>

      {/* ── Chunk rows ── */}
      <div className="flex flex-col gap-1 p-2">
        {chunks.map(chunk => {
          const assignment  = liveAssignments.find(a => a.taskId === chunk.id);
          const isActive    = anim.activeTaskId === chunk.id;
          const isDone      = !!assignment;
          const isScheduled = isDone && assignment.status === 'Scheduled';

          return (
            <div
              key={chunk.id}
              data-card-id={chunk.id}
              className={`
                relative rounded-lg border px-3 py-2 transition-all duration-300 ml-1
                ${isActive                            ? 'task-highlighting border-yellow-500/60 bg-slate-800 z-10' : ''}
                ${!isActive && isScheduled            ? 'border-green-500/20 bg-slate-800/30 opacity-60' : ''}
                ${!isActive && isDone && !isScheduled ? 'border-red-500/30 bg-red-900/10' : ''}
                ${!isActive && !isDone                ? 'border-slate-600/50 bg-slate-800/30' : ''}
              `}
            >
              <div className="flex items-center gap-2">
                {/* Chunk index indicator */}
                <span className="text-[9px] font-mono text-orange-400 flex-shrink-0 w-6">
                  C{chunk.chunkIndex}/{chunk.totalChunks}
                </span>
                <span className="text-[11px] font-semibold text-slate-300 truncate flex-1">
                  {chunk.name}
                </span>
              </div>
              <div className="flex gap-2 mt-1 ml-6 flex-wrap">
                <span className="text-[10px] font-mono text-slate-500">{chunk.cpu}c</span>
                <span className="text-[10px] font-mono text-slate-500">{chunk.ram} GB</span>
                {chunk.preferredMachineId && !isDone && (
                  <span className="text-[9px] font-mono text-orange-500/70 ml-1">
                    → {chunk.preferredMachineId}
                  </span>
                )}
              </div>
              {isDone && (
                <p className={`text-[10px] font-bold mt-1 ml-6 ${isScheduled ? 'text-green-400' : 'text-red-400'}`}>
                  {isScheduled ? `✓ → ${assignment.machineName}` : '✗ Unschedulable'}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Summary panel ──────────────────────────────────────────────────────── */

function SummaryPanel({ assignments, splitRegistry, onProceed }) {
  const scheduled     = assignments.filter(a => a.status === 'Scheduled');
  const unschedulable = assignments.filter(a => a.status === 'Unschedulable');
  const machinesUsed  = new Set(scheduled.map(a => a.machineId)).size;
  const splitCount    = Object.keys(splitRegistry).length;

  return (
    <div className="banner-enter bg-slate-800/60 rounded-2xl border border-slate-700 p-6 mt-2">
      <h3 className="text-base font-bold text-slate-100 mb-5 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
        Matching Summary
      </h3>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label="Scheduled"     value={scheduled.length}     color="text-green-400"  />
        <StatCard label="Unschedulable" value={unschedulable.length} color={unschedulable.length ? 'text-red-400' : 'text-slate-500'} />
        <StatCard label="Machines Used" value={machinesUsed}         color="text-blue-400"   />
        <StatCard label="Tasks Split"   value={splitCount}           color={splitCount ? 'text-orange-400' : 'text-slate-500'} />
      </div>

      {/* Split details callout */}
      {splitCount > 0 && (
        <div className="mb-5 p-4 rounded-xl bg-orange-900/15 border border-orange-500/30">
          <p className="text-xs font-semibold text-orange-300 mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
            Split Tasks — Distributed Execution
          </p>
          <div className="space-y-2">
            {Object.entries(splitRegistry).map(([pid, info]) => {
              const chunkAssignments = assignments.filter(a => a.parentTaskId === pid);
              const machines = [...new Set(chunkAssignments.map(a => a.machineName).filter(Boolean))];
              return (
                <div key={pid} className="bg-slate-800/60 rounded-lg px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-slate-200">{info.parentTaskName}</span>
                    <span className="text-orange-400 font-mono">→ {info.totalChunks} chunks</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 ml-0.5">
                    {chunkAssignments.map(a => (
                      <span key={a.taskId} className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${
                        a.status === 'Scheduled'
                          ? 'bg-green-900/30 text-green-400 border-green-600/30'
                          : 'bg-red-900/30 text-red-400 border-red-600/30'
                      }`}>
                        C{a.chunkIndex} → {a.machineName ?? '✗'}
                      </span>
                    ))}
                  </div>
                  {machines.length > 1 && (
                    <p className="text-[10px] text-slate-500 mt-1.5">
                      Results will be merged after parallel execution on {machines.join(', ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Assignment table */}
      <div className="overflow-x-auto rounded-xl border border-slate-700 mb-5">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-800/80">
              {['Task', 'Machine', 'CPU', 'RAM', 'Duration', 'Status'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-slate-400 font-semibold uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assignments.map((a, i) => (
              <tr
                key={a.taskId}
                className={`border-t border-slate-700/40 ${
                  a.parentTaskId ? 'bg-orange-900/5' : (i % 2 === 0 ? '' : 'bg-slate-800/30')
                }`}
              >
                <td className="px-3 py-2 font-semibold text-slate-200 whitespace-nowrap">
                  {a.parentTaskId && (
                    <span className="text-[9px] text-orange-400 font-mono mr-1.5">
                      C{a.chunkIndex}/{a.totalChunks}
                    </span>
                  )}
                  {a.taskName}
                </td>
                <td className="px-3 py-2 font-mono text-slate-300">{a.machineName ?? '—'}</td>
                <td className="px-3 py-2 font-mono text-slate-300">{a.cpuAllocated > 0 ? `${a.cpuAllocated}c` : '—'}</td>
                <td className="px-3 py-2 font-mono text-slate-300">{a.ramAllocated > 0 ? `${a.ramAllocated} GB` : '—'}</td>
                <td className="px-3 py-2 font-mono text-slate-300">{a.estimatedDuration}s</td>
                <td className="px-3 py-2">
                  <span className={`font-bold ${a.status === 'Scheduled' ? 'text-green-400' : 'text-red-400'}`}>
                    {a.status === 'Scheduled' ? '✓ Scheduled' : '✗ Unschedulable'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Unschedulable callout */}
      {unschedulable.length > 0 && (
        <div className="mb-5 p-3 rounded-xl bg-red-900/20 border border-red-500/30">
          <p className="text-xs font-semibold text-red-300 mb-2">
            Unschedulable tasks (insufficient capacity even after splitting):
          </p>
          <div className="flex flex-wrap gap-2">
            {unschedulable.map(a => (
              <span key={a.taskId} className="text-xs px-2 py-1 rounded-lg bg-red-900/40 border border-red-500/30 text-red-300 font-mono">
                {a.taskName}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onProceed}
        className="w-full rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-semibold py-3 text-sm shadow-lg shadow-purple-900/40 transition-all"
      >
        → Proceed to Execution
      </button>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
      <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
    </div>
  );
}
