/**
 * Best Fit Decreasing (BFD) matching algorithm with smart task splitting.
 *
 * When a task is too large to fit on any single machine, trySplitTask()
 * computes variable-size chunks proportional to each machine's capacity,
 * assigning each chunk a `preferredMachineId` hint.  The BFD pass then
 * honours the hint (giving it a large priority bonus) and falls back to
 * normal BFD if the preferred machine is already full.
 *
 * Returns:
 *   sortedTasks   — expanded, sorted task list (chunks replace oversized originals)
 *   assignments   — final result array, same order as sortedTasks
 *   trace         — per-task evaluation steps for animation replay
 *   splitRegistry — { [originalTaskId]: { totalChunks, parentTaskName } }
 */

/* ─── helpers ────────────────────────────────────────────────────────────── */

/**
 * Attempt to split an oversized task into variable-size chunks, each
 * proportional to a specific machine's capacity.
 *
 * Algorithm:
 *  1. Verify total fleet capacity can cover the task (quick feasibility).
 *  2. Sort machines by descending capacity score (cpu × ram).
 *  3. Walk machines in order; for each, compute the largest chunk that:
 *       a) respects remaining task demand, and
 *       b) fits within that machine's capacity while preserving
 *          the task's original CPU:RAM ratio as closely as possible.
 *  4. Assign a `preferredMachineId` to each chunk.
 *  5. Return null if the task already fits one machine (no split needed),
 *     or if total fleet capacity is genuinely insufficient.
 */
function trySplitTask(task, onlineMachines) {
  if (onlineMachines.length === 0) return null;

  /* Already fits somewhere → no split */
  if (onlineMachines.some(m => m.cpu >= task.cpu && m.ram >= task.ram)) return null;

  /* Quick feasibility: total fleet must have enough of both dimensions */
  const totalCpu = onlineMachines.reduce((s, m) => s + m.cpu, 0);
  const totalRam = onlineMachines.reduce((s, m) => s + m.ram, 0);
  if (totalCpu < task.cpu || totalRam < task.ram) return null;   /* truly unschedulable */

  /* Sort machines largest-first so the biggest chunks go to the biggest machines */
  const sorted = [...onlineMachines].sort(
    (a, b) => (b.cpu * b.ram) - (a.cpu * a.ram) || b.cpu - a.cpu
  );

  const chunks  = [];
  let remCpu    = task.cpu;
  let remRam    = task.ram;

  for (const machine of sorted) {
    if (remCpu <= 0 && remRam <= 0) break;

    let takeCpu, takeRam;

    if (remCpu <= 0) {
      /* CPU already satisfied — mop up remaining RAM */
      takeCpu = 0;
      takeRam = Math.min(machine.ram, remRam);
    } else if (remRam <= 0) {
      /* RAM already satisfied — mop up remaining CPU */
      takeCpu = Math.min(machine.cpu, remCpu);
      takeRam = 0;
    } else {
      /*
       * Both dimensions still needed.
       * Use the CURRENT remaining ratio so rounding errors don't
       * accumulate across iterations.
       *   cpuFraction = fraction of remaining CPU this machine takes
       *   takeRam     = proportional share of remaining RAM
       */
      takeCpu = Math.min(machine.cpu, remCpu);
      const cpuFraction = takeCpu / remCpu;
      takeRam = Math.min(Math.ceil(cpuFraction * remRam), machine.ram, remRam);

      /* If RAM is the bottleneck, scale CPU down to match */
      if (takeRam < Math.ceil(cpuFraction * remRam)) {
        const ramFraction = takeRam / remRam;
        takeCpu = Math.min(Math.ceil(ramFraction * remCpu), machine.cpu, remCpu);
      }
    }

    /* Nothing useful from this machine */
    if (takeCpu <= 0 && takeRam <= 0) continue;

    chunks.push({
      id:                `${task.id}__chunk__${chunks.length}`,
      cpu:               takeCpu,
      ram:               takeRam,
      duration:          task.duration,
      priority:          task.priority,
      /* split metadata — name & totalChunks filled in after loop */
      parentTaskId:      task.id,
      parentTaskName:    task.name,
      chunkIndex:        chunks.length + 1,   /* 1-based, updated below */
      totalChunks:       0,                   /* placeholder */
      preferredMachineId: machine.id,
    });

    remCpu = Math.max(0, remCpu - takeCpu);
    remRam = Math.max(0, remRam - takeRam);
  }

  /* If residual demand remains, the fleet can't cover it → unschedulable */
  if (remCpu > 0 || remRam > 0) return null;

  /* Finalise chunk metadata now that we know totalChunks */
  const n = chunks.length;
  chunks.forEach((c, i) => {
    c.totalChunks = n;
    c.chunkIndex  = i + 1;
    c.name        = `${task.name} [${i + 1}/${n}]`;
  });

  return chunks;
}

/* ─── main export ────────────────────────────────────────────────────────── */

export function runBFD(tasks, machines) {
  const onlineMachines = machines.filter(m => m.status !== 'Offline');

  /* 1. Sort original tasks by CPU desc, then RAM desc */
  const sortedOriginal = [...tasks].sort((a, b) => b.cpu - a.cpu || b.ram - a.ram);

  /* 2. Expand oversized tasks into proportional chunks */
  const expandedTasks = [];
  const splitRegistry = {};   /* originalTaskId → { totalChunks, parentTaskName } */

  for (const task of sortedOriginal) {
    const chunks = onlineMachines.length > 0 ? trySplitTask(task, onlineMachines) : null;
    if (chunks) {
      splitRegistry[task.id] = { totalChunks: chunks.length, parentTaskName: task.name };
      expandedTasks.push(...chunks);
    } else {
      expandedTasks.push(task);
    }
  }

  /* 3. Track remaining capacity per machine */
  const avail = {};
  machines.forEach(m => {
    avail[m.id] = {
      cpu: m.status === 'Offline' ? 0 : m.cpu,
      ram: m.status === 'Offline' ? 0 : m.ram,
    };
  });

  const assignments = [];
  const trace       = [];

  /* 4. BFD on expanded task list.
        For chunks with a preferredMachineId, give that machine a large scoring
        bonus so it wins whenever it still has capacity — without bypassing the
        normal evaluation (the animation still shows all machines being checked). */
  expandedTasks.forEach(task => {
    const machineEvals  = [];
    let bestMachine     = null;
    let bestEffective   = Infinity;   /* lower = better */

    const PREFER_BONUS = 1_000_000;   /* large enough to always win when machine fits */

    onlineMachines.forEach(m => {
      const a    = avail[m.id];
      const fits = a.cpu >= task.cpu && a.ram >= task.ram;
      const waste = fits ? (a.cpu - task.cpu) + (a.ram - task.ram) : null;

      /* Preferred machine: subtract a huge bonus so it sorts to the front */
      const effective = fits
        ? waste - (task.preferredMachineId === m.id ? PREFER_BONUS : 0)
        : null;

      machineEvals.push({ machineId: m.id, machineName: m.name, fits, waste });

      if (fits && effective < bestEffective) {
        bestEffective = effective;
        bestMachine   = m;
      }
    });

    if (bestMachine) {
      avail[bestMachine.id].cpu -= task.cpu;
      avail[bestMachine.id].ram -= task.ram;

      assignments.push({
        taskId:             task.id,
        taskName:           task.name,
        priority:           task.priority,
        machineId:          bestMachine.id,
        machineName:        bestMachine.name,
        cpuAllocated:       task.cpu,
        ramAllocated:       task.ram,
        estimatedDuration:  task.duration,
        status:             'Scheduled',
        /* split metadata (undefined for regular tasks) */
        parentTaskId:       task.parentTaskId,
        parentTaskName:     task.parentTaskName,
        chunkIndex:         task.chunkIndex,
        totalChunks:        task.totalChunks,
        preferredMachineId: task.preferredMachineId,
      });
    } else {
      assignments.push({
        taskId:             task.id,
        taskName:           task.name,
        priority:           task.priority,
        machineId:          null,
        machineName:        null,
        cpuAllocated:       0,
        ramAllocated:       0,
        estimatedDuration:  task.duration,
        status:             'Unschedulable',
        parentTaskId:       task.parentTaskId,
        parentTaskName:     task.parentTaskName,
        chunkIndex:         task.chunkIndex,
        totalChunks:        task.totalChunks,
        preferredMachineId: task.preferredMachineId,
      });
    }

    trace.push({
      taskId:             task.id,
      machineEvals,
      assignedMachineId:  bestMachine?.id ?? null,
      /* split metadata */
      isChunk:            !!task.parentTaskId,
      parentTaskId:       task.parentTaskId,
      chunkIndex:         task.chunkIndex,
      totalChunks:        task.totalChunks,
      preferredMachineId: task.preferredMachineId,
    });
  });

  return { sortedTasks: expandedTasks, assignments, trace, splitRegistry };
}
