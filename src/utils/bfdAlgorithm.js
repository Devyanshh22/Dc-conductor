/**
 * Best Fit Decreasing (BFD) matching algorithm.
 *
 * Each task carries auto-computed estimatedCPU and estimatedRAM fields.
 * Tasks are treated as atomic — no splitting.
 * BFD selects the machine that fits a task with the least leftover capacity.
 *
 * Returns:
 *   sortedTasks   — tasks sorted largest-first (CPU desc, RAM desc)
 *   assignments   — one entry per task
 *   trace         — per-task evaluation steps for animation replay
 *   splitRegistry — always {} (splitting removed)
 */
export function runBFD(tasks, machines) {
  const onlineMachines = machines.filter(m => {
    const status = (m.status || '').toLowerCase();
    return status !== 'offline' && status !== 'off' && status !== 'down';
  });

  console.log('[BFD] Online machines for matching:', onlineMachines.map(m => m.name + ' (' + m.status + ')'));

  if (!onlineMachines.length) {
    console.warn('[BFD] No online machines available for matching');
    return { sortedTasks: [...tasks], assignments: [], trace: [], splitRegistry: {} };
  }

  /* 1. Sort tasks largest-first */
  const sortedTasks = [...tasks].sort(
    (a, b) => b.estimatedCPU - a.estimatedCPU || b.estimatedRAM - a.estimatedRAM,
  );

  /* 2. Track remaining capacity per online machine */
  const avail = {};
  onlineMachines.forEach(m => {
    avail[m.id] = {
      cpu: m.cpu,
      ram: m.ram,
    };
  });

  const assignments = [];
  const trace       = [];

  /* 3. BFD pass */
  sortedTasks.forEach(task => {
    const machineEvals = [];
    let bestMachine    = null;
    let bestWaste      = Infinity;

    onlineMachines.forEach(m => {
      const a    = avail[m.id];
      const fits = a.cpu >= task.estimatedCPU && a.ram >= task.estimatedRAM;
      const waste = fits ? (a.cpu - task.estimatedCPU) + (a.ram - task.estimatedRAM) : null;

      machineEvals.push({ machineId: m.id, machineName: m.name, fits, waste });

      if (fits && waste < bestWaste) {
        bestWaste   = waste;
        bestMachine = m;
      }
    });

    if (bestMachine) {
      avail[bestMachine.id].cpu -= task.estimatedCPU;
      avail[bestMachine.id].ram -= task.estimatedRAM;

      assignments.push({
        taskId:            task.id,
        taskName:          task.name,
        taskType:          task.type,
        machineId:         bestMachine.id,
        machineName:       bestMachine.name,
        cpuAllocated:      task.estimatedCPU,
        ramAllocated:      task.estimatedRAM,
        estimatedDuration: task.duration,
        status:            'Scheduled',
      });
    } else {
      assignments.push({
        taskId:            task.id,
        taskName:          task.name,
        taskType:          task.type,
        machineId:         null,
        machineName:       null,
        cpuAllocated:      0,
        ramAllocated:      0,
        estimatedDuration: task.duration,
        status:            'Unschedulable',
      });
    }

    trace.push({
      taskId:            task.id,
      machineEvals,
      assignedMachineId: bestMachine?.id ?? null,
      isChunk:           false,
    });
  });

  return { sortedTasks, assignments, trace, splitRegistry: {} };
}
