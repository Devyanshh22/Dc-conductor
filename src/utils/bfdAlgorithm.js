/**
 * Best Fit Decreasing (BFD) matching algorithm with task splitting.
 *
 * When a task is too large to fit on any single machine, trySplitTask()
 * breaks it into the minimum number of equal chunks that each fit on at
 * least one online machine.  The chunks are then matched via BFD like any
 * other task.
 *
 * Returns:
 *   sortedTasks   — expanded, sorted task list (chunks replace oversized originals)
 *   assignments   — final result array, same order as sortedTasks
 *   trace         — per-task evaluation steps for animation replay
 *   splitRegistry — { [originalTaskId]: { totalChunks, parentTaskName } }
 */

/* ─── helpers ────────────────────────────────────────────────────────────── */

/**
 * If `task` does not fit any single online machine, compute the minimum
 * number of equal-sized chunks that each do fit, and return the chunk array.
 * Returns null when the task fits as-is (no split needed).
 */
function trySplitTask(task, onlineMachines) {
  if (onlineMachines.length === 0) return null;

  /* Already fits somewhere → no split */
  if (onlineMachines.some(m => m.cpu >= task.cpu && m.ram >= task.ram)) return null;

  const maxCpu = Math.max(...onlineMachines.map(m => m.cpu));
  const maxRam = Math.max(...onlineMachines.map(m => m.ram));

  /* Minimum chunks so each chunk fits within the largest machine */
  const nCpu = task.cpu > maxCpu ? Math.ceil(task.cpu / maxCpu) : 1;
  const nRam = task.ram > maxRam ? Math.ceil(task.ram / maxRam) : 1;
  const n    = Math.max(nCpu, nRam, 2);   /* always at least 2 chunks */

  /* Distribute resources as evenly as possible; last chunk gets remainder */
  const baseCpu = Math.floor(task.cpu / n);
  const baseRam = Math.floor(task.ram / n);
  const remCpu  = task.cpu % n;
  const remRam  = task.ram % n;

  return Array.from({ length: n }, (_, i) => ({
    id:             `${task.id}__chunk__${i}`,
    name:           `${task.name} [${i + 1}/${n}]`,
    cpu:            baseCpu + (i < remCpu ? 1 : 0),
    ram:            baseRam + (i < remRam ? 1 : 0),
    duration:       task.duration,   /* each chunk runs for the same duration */
    priority:       task.priority,
    /* split metadata */
    parentTaskId:   task.id,
    parentTaskName: task.name,
    chunkIndex:     i + 1,
    totalChunks:    n,
  }));
}

/* ─── main export ────────────────────────────────────────────────────────── */

export function runBFD(tasks, machines) {
  const onlineMachines = machines.filter(m => m.status !== 'Offline');

  /* 1. Sort original tasks by CPU desc, then RAM desc */
  const sortedOriginal = [...tasks].sort((a, b) => b.cpu - a.cpu || b.ram - a.ram);

  /* 2. Expand oversized tasks into chunks */
  const expandedTasks  = [];
  const splitRegistry  = {};   /* originalTaskId → { totalChunks, parentTaskName } */

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

  /* 4. BFD on expanded task list */
  expandedTasks.forEach(task => {
    const machineEvals = [];
    let bestMachine    = null;
    let bestWaste      = Infinity;

    onlineMachines.forEach(m => {
      const a     = avail[m.id];
      const fits  = a.cpu >= task.cpu && a.ram >= task.ram;
      const waste = fits ? (a.cpu - task.cpu) + (a.ram - task.ram) : null;

      machineEvals.push({ machineId: m.id, machineName: m.name, fits, waste });

      if (fits && waste < bestWaste) {
        bestWaste   = waste;
        bestMachine = m;
      }
    });

    if (bestMachine) {
      avail[bestMachine.id].cpu -= task.cpu;
      avail[bestMachine.id].ram -= task.ram;

      assignments.push({
        taskId:            task.id,
        taskName:          task.name,
        priority:          task.priority,
        machineId:         bestMachine.id,
        machineName:       bestMachine.name,
        cpuAllocated:      task.cpu,
        ramAllocated:      task.ram,
        estimatedDuration: task.duration,
        status:            'Scheduled',
        /* split metadata (undefined for regular tasks) */
        parentTaskId:      task.parentTaskId,
        parentTaskName:    task.parentTaskName,
        chunkIndex:        task.chunkIndex,
        totalChunks:       task.totalChunks,
      });
    } else {
      assignments.push({
        taskId:            task.id,
        taskName:          task.name,
        priority:          task.priority,
        machineId:         null,
        machineName:       null,
        cpuAllocated:      0,
        ramAllocated:      0,
        estimatedDuration: task.duration,
        status:            'Unschedulable',
        parentTaskId:      task.parentTaskId,
        parentTaskName:    task.parentTaskName,
        chunkIndex:        task.chunkIndex,
        totalChunks:       task.totalChunks,
      });
    }

    trace.push({
      taskId:            task.id,
      machineEvals,
      assignedMachineId: bestMachine?.id ?? null,
      /* split metadata */
      isChunk:           !!task.parentTaskId,
      parentTaskId:      task.parentTaskId,
      chunkIndex:        task.chunkIndex,
      totalChunks:       task.totalChunks,
    });
  });

  return { sortedTasks: expandedTasks, assignments, trace, splitRegistry };
}
