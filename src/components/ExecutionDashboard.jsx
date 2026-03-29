import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import GlobalMetricsBar    from './GlobalMetricsBar';
import CompletedQueue      from './CompletedQueue';
import executionSocket     from '../utils/executionSocket';
import { startExecution }  from '../utils/apiClient';

/**
 * ExecutionDashboard  (Step 4)
 *
 * Flow:
 *   'preflight' → user clicks "Connect to Workers"
 *   'running'   → tasks cycle Queued → Dispatched → Processing → Complete
 *   'done'      → all tasks finished, "Proceed to Output" enabled
 *
 * If the backend is offline, the dashboard falls back to a simulated
 * status-transition mode (no real computation).
 *
 * Props:
 *   onProceed  {function}
 *   sessionId  {string|null}
 *   showToast  {function}
 */
export default function ExecutionDashboard({ onProceed, sessionId, showToast }) {

  /* ── Load localStorage once ─────────────────────────────────────────────── */
  const { assignments, machines } = useMemo(() => {
    const a = JSON.parse(localStorage.getItem('schedulerAssignments') || '[]');
    const m = JSON.parse(localStorage.getItem('schedulerMachines')    || '[]');
    return { assignments: a, machines: m };
  }, []);

  const scheduled     = useMemo(() => assignments.filter(a => a.status === 'Scheduled'), [assignments]);
  const onlineMachines = machines.filter(m => m.status !== 'Offline');

  /* ── Phase state ─────────────────────────────────────────────────────────── */
  const [phase,         setPhase]         = useState('preflight');
  const [checklistStep, setChecklistStep] = useState(0);
  const [backendError,  setBackendError]  = useState(false);
  const [wsStatus,      setWsStatus]      = useState('disconnected');

  /* ── Execution state ─────────────────────────────────────────────────────── */
  // { [taskId]: 'queued' | 'dispatched' | 'processing' | 'complete' }
  const [taskStatuses,   setTaskStatuses]   = useState({});
  const [completedTasks, setCompletedTasks] = useState([]);
  const [elapsedMs,      setElapsedMs]      = useState(0);

  /* ── Refs ────────────────────────────────────────────────────────────────── */
  const execStartRef    = useRef(null);
  const elapsedTimer    = useRef(null);
  const simTimers       = useRef([]);
  const wsUnsubscribers = useRef([]);
  /* taskId → mathResults array from WS task_complete messages */
  const mathResultsRef  = useRef({});
  /* taskId → grayscaleData data-URL from WS task_complete messages */
  const imageResultsRef = useRef({});

  /* ── Pre-flight checklist stagger ───────────────────────────────────────── */
  useEffect(() => {
    if (phase !== 'preflight') return;
    const t1 = setTimeout(() => setChecklistStep(1), 300);
    const t2 = setTimeout(() => setChecklistStep(2), 750);
    const t3 = setTimeout(() => setChecklistStep(3), 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [phase]);

  /* ── Wall-clock elapsed timer ───────────────────────────────────────────── */
  useEffect(() => {
    if (phase !== 'running') return;
    elapsedTimer.current = setInterval(() => {
      setElapsedMs(Date.now() - (execStartRef.current ?? Date.now()));
    }, 250);
    return () => clearInterval(elapsedTimer.current);
  }, [phase]);

  /* ── WebSocket status subscription ─────────────────────────────────────── */
  useEffect(() => {
    const unsub = executionSocket.onStatusChange(setWsStatus);
    setWsStatus(executionSocket.getStatus());
    return unsub;
  }, []);

  /* ── Cleanup on unmount ─────────────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      simTimers.current.forEach(clearTimeout);
      wsUnsubscribers.current.forEach(fn => fn());
    };
  }, []);

  /* ── Helpers ─────────────────────────────────────────────────────────────── */
  function initStatuses() {
    const s = {};
    scheduled.forEach(a => { s[a.taskId] = 'queued'; });
    return s;
  }

  function buildAndSaveResults() {
    const results = scheduled.map(a => ({
      taskId:         a.taskId,
      taskName:       a.taskName,
      taskType:       a.taskType,
      machineId:      a.machineId,
      machineName:    a.machineName,
      cpuAllocated:   a.cpuAllocated,
      ramAllocated:   a.ramAllocated,
      startTime:      new Date(execStartRef.current ?? Date.now()).toISOString(),
      endTime:        new Date().toISOString(),
      actualDuration: a.estimatedDuration ?? 5,
      status:         'completed',
      /* Real results from workers (null in simulated mode) */
      mathResults:   mathResultsRef.current[a.taskId]  ?? null,
      grayscaleData: imageResultsRef.current[a.taskId] ?? null,
    }));
    localStorage.setItem('schedulerResults', JSON.stringify(results));
    return results;
  }

  function addCompleted(assignment, actualDuration) {
    setCompletedTasks(prev => {
      if (prev.some(t => t.taskId === assignment.taskId)) return prev;
      return [...prev, {
        ...assignment,
        status:              'complete',
        actualDuration:      actualDuration ?? assignment.estimatedDuration ?? 5,
        estimatedDurationMs: (actualDuration ?? assignment.estimatedDuration ?? 5) * 1000,
      }];
    });
  }

  /* ── Simulated fallback ──────────────────────────────────────────────────── */
  function runSimulated() {
    const byMachine = {};
    scheduled.forEach(a => {
      if (!byMachine[a.machineId]) byMachine[a.machineId] = [];
      byMachine[a.machineId].push(a);
    });

    let maxEndMs = 0;

    Object.values(byMachine).forEach(queue => {
      let offset = 0;
      queue.forEach(a => {
        const dur = (a.estimatedDuration ?? 5) * 1000;

        const t1 = setTimeout(() =>
          setTaskStatuses(p => ({ ...p, [a.taskId]: 'dispatched' })),
          offset + 300,
        );
        const t2 = setTimeout(() =>
          setTaskStatuses(p => ({ ...p, [a.taskId]: 'processing' })),
          offset + 700,
        );
        const t3 = setTimeout(() => {
          setTaskStatuses(p => ({ ...p, [a.taskId]: 'complete' }));
          addCompleted(a, a.estimatedDuration);
        }, offset + dur);

        simTimers.current.push(t1, t2, t3);
        offset += dur;
      });
      maxEndMs = Math.max(maxEndMs, offset);
    });

    const tDone = setTimeout(() => {
      setPhase('done');
      buildAndSaveResults();
    }, maxEndMs + 400);
    simTimers.current.push(tDone);
  }

  /* ── Connect to Workers ──────────────────────────────────────────────────── */
  const handleConnect = useCallback(async () => {
    execStartRef.current = Date.now();
    setTaskStatuses(initStatuses());
    setCompletedTasks([]);
    setElapsedMs(0);
    setPhase('running');

    const result = await startExecution(sessionId, scheduled);

    if (result) {
      /* ── Real backend mode ── */
      setBackendError(false);
      executionSocket.connect();

      const u1 = executionSocket.onStatusChange(setWsStatus);
      const u2 = executionSocket.onProgress(msg => {
        setTaskStatuses(p => ({ ...p, [msg.taskId]: 'processing' }));
      });
      const u3 = executionSocket.onComplete(msg => {
        setTaskStatuses(p => ({ ...p, [msg.taskId]: 'complete' }));
        /* Store real results for OutputDashboard */
        if (msg.taskType === 'math' && msg.mathResults) {
          mathResultsRef.current[msg.taskId] = msg.mathResults;
        }
        if (msg.taskType === 'image' && msg.grayscaleData) {
          imageResultsRef.current[msg.taskId] = msg.grayscaleData;
        }
        const a = scheduled.find(a => a.taskId === msg.taskId);
        if (a) addCompleted({ ...a, actualDuration: msg.actualDuration }, msg.actualDuration);
      });
      const u4 = executionSocket.onAllDone(() => {
        setPhase('done');
        buildAndSaveResults();
        executionSocket.disconnect();
        wsUnsubscribers.current.forEach(fn => fn());
        wsUnsubscribers.current = [];
      });

      wsUnsubscribers.current = [u1, u2, u3, u4];
    } else {
      /* ── Simulated fallback ── */
      setBackendError(true);
      runSimulated();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, scheduled]);

  /* ── GlobalMetricsBar-compatible taskStates ──────────────────────────────── */
  const taskStatesForBar = useMemo(() => {
    const s = {};
    scheduled.forEach(a => {
      const st = taskStatuses[a.taskId] ?? 'queued';
      s[a.taskId] = {
        taskId:              a.taskId,
        status:              st === 'complete' ? 'completed'
                           : (st === 'processing' || st === 'dispatched') ? 'running'
                           : 'queued',
        progress:            st === 'complete' ? 100
                           : st === 'processing' ? 55
                           : st === 'dispatched' ? 10
                           : 0,
        estimatedDurationMs: (a.estimatedDuration ?? 5) * 1000,
        elapsedMs:           0,
      };
    });
    return s;
  }, [taskStatuses, scheduled]);

  /* ══════════════════════════════════════════════════════════════════════════
     PRE-FLIGHT SCREEN
  ══════════════════════════════════════════════════════════════════════════ */
  if (phase === 'preflight') {
    return (
      <div className="exec-fade-up flex justify-center pt-10 pb-16">
        <div className="w-full max-w-md bg-slate-800/60 rounded-2xl border border-slate-700 p-8">

          <div className="mb-7">
            <h2 className="text-base font-bold text-slate-100">Execution Pre-Flight</h2>
            <p className="text-xs text-slate-500 mt-0.5">Verifying all systems before launch</p>
          </div>

          <div className="space-y-2 mb-7">
            <ChecklistItem
              visible={checklistStep >= 1}
              label="Tasks loaded"
              detail={`${scheduled.length} task${scheduled.length !== 1 ? 's' : ''} ready for execution`}
            />
            <ChecklistItem
              visible={checklistStep >= 2}
              label="Machines online"
              detail={`${onlineMachines.length} / ${machines.length} nodes available`}
            />
            <ChecklistItem
              visible={checklistStep >= 3}
              label="Assignments confirmed"
              detail={`${scheduled.length} task–machine assignments loaded`}
            />
          </div>

          {checklistStep >= 3 && (
            <div className="exec-checklist-enter">
              <div className="flex items-center gap-2 text-xs text-green-400 mb-4 bg-green-900/20 border border-green-700/30 rounded-lg px-3 py-2">
                <span className="text-sm flex-shrink-0">✓</span>
                <span className="font-medium">All systems ready — cleared for launch</span>
              </div>
              <button
                onClick={handleConnect}
                className="
                  w-full py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98]
                  rounded-xl text-sm font-bold text-white transition-all duration-200
                  shadow-lg shadow-indigo-900/40 cursor-pointer
                "
              >
                Connect to Workers
              </button>
            </div>
          )}

        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════════════
     RUNNING / DONE SCREEN
  ══════════════════════════════════════════════════════════════════════════ */
  const isDone = phase === 'done';

  return (
    <div className="exec-fade-up space-y-6">

      {/* ── Backend offline warning ── */}
      {backendError && (
        <div className="flex items-start gap-3 rounded-xl bg-yellow-900/20 border border-yellow-600/40 px-4 py-3">
          <span className="text-yellow-400 text-base flex-shrink-0">⚠</span>
          <div>
            <p className="text-sm font-semibold text-yellow-300">Workers not connected</p>
            <p className="text-xs text-yellow-600 mt-0.5">
              Could not reach the backend on port 3001. Running in simulated mode.
              Start the backend to execute tasks on real worker threads.
            </p>
          </div>
        </div>
      )}

      {/* ── 1. Global Metrics Bar ── */}
      <GlobalMetricsBar
        taskStates={taskStatesForBar}
        machineStates={{}}
        elapsedMs={elapsedMs}
        phase={isDone ? 'done' : 'running'}
        wsStatus={backendError ? null : wsStatus}
      />

      {/* ── 2. Task Status List ── */}
      <section>
        <SectionHeader
          icon="⚙️"
          title="Task Status"
          badge={`${scheduled.length} task${scheduled.length !== 1 ? 's' : ''}`}
        />
        {scheduled.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-slate-600 text-sm bg-slate-800/30 rounded-xl border border-slate-700/40">
            No scheduled tasks found
          </div>
        ) : (
          <div className="space-y-1.5">
            {scheduled.map(a => (
              <TaskStatusRow
                key={a.taskId}
                assignment={a}
                status={taskStatuses[a.taskId] ?? 'queued'}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── 3. Completed – Awaiting Merge ── */}
      <section>
        <SectionHeader
          icon="📦"
          title="Completed — Awaiting Merge"
          badge={completedTasks.length > 0
            ? `${completedTasks.length} / ${scheduled.length}`
            : undefined}
        />
        <CompletedQueue
          completedTasks={completedTasks}
          totalTasks={scheduled.length}
          onProceed={onProceed}
          phase={isDone ? 'done' : 'running'}
        />
      </section>

    </div>
  );
}

/* ── Sub-components ───────────────────────────────────────────────────────── */

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

const STATUS_CONFIG = {
  queued:     { label: 'Queued',      dot: 'bg-slate-500',              text: 'text-slate-400',  border: 'border-slate-600/40',    bg: 'bg-slate-700/40'    },
  dispatched: { label: 'Dispatched',  dot: 'bg-yellow-400 animate-pulse', text: 'text-yellow-300', border: 'border-yellow-600/40', bg: 'bg-yellow-900/20'   },
  processing: { label: 'Processing',  dot: 'bg-blue-400 animate-pulse', text: 'text-blue-300',   border: 'border-blue-600/40',     bg: 'bg-blue-900/20'     },
  complete:   { label: 'Complete',    dot: 'bg-green-400',              text: 'text-green-300',  border: 'border-green-600/40',    bg: 'bg-green-900/20'    },
};

function TaskStatusRow({ assignment, status }) {
  const cfg    = STATUS_CONFIG[status] ?? STATUS_CONFIG.queued;
  const isMath = assignment.taskType === 'math';

  return (
    <div className="flex items-center gap-3 rounded-lg bg-slate-800/50 border border-slate-700/50 px-4 py-2.5 transition-colors duration-300">
      {/* Type icon */}
      <span className={`
        text-[10px] font-bold px-1.5 py-0.5 rounded font-mono flex-shrink-0
        ${isMath ? 'bg-blue-900/40 text-blue-300' : 'bg-purple-900/40 text-purple-300'}
      `}>
        {isMath ? '∑' : '🖼'}
      </span>

      {/* Task name */}
      <span className="flex-1 text-xs font-medium text-slate-200 truncate">
        {assignment.taskName}
      </span>

      {/* Machine name */}
      <span className="text-[10px] text-slate-500 truncate hidden sm:block font-mono">
        {assignment.machineName}
      </span>

      {/* Status badge */}
      <div className={`
        flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-semibold
        flex-shrink-0 ${cfg.bg} ${cfg.border}
      `}>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
        <span className={cfg.text}>{cfg.label}</span>
      </div>
    </div>
  );
}
