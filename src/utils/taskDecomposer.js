/**
 * Task Decomposer — splits each task into typed sub-tasks,
 * then assigns affinity (preferred machine) per operation type.
 *
 * Sub-tasks use the same field schema as BFD split-chunks
 * (parentTaskId, chunkIndex, totalChunks, preferredMachineId)
 * so MatchingEngine's SplitGroupCard handles them naturally.
 */

/* ── Decomposition map: operationType → [sub-task labels] ─── */
const DECOMP_MAP = {
  Arithmetic: ['Parse',      'Calculate',   'Aggregate'  ],
  'I/O':      ['Read',       'Process',     'Write'      ],
  Memory:     ['Allocate',   'Transform',   'Deallocate' ],
  Compute:    ['Preprocess', 'Execute',     'Postprocess'],
  Render:     ['Fetch',      'Compose',     'Render'     ],
};

/* Resource fractions for the 3 sub-tasks [heavy, medium, light] */
const FRACTIONS = [0.40, 0.30, 0.30];

/**
 * Decompose each task into 3 typed sub-tasks proportional to its resources.
 * Returns a flat array of sub-tasks ready for BFD scheduling.
 */
export function decomposeTasks(tasks) {
  const subTasks = [];

  for (const task of tasks) {
    const opType = task.operationType || 'Compute';
    const labels = DECOMP_MAP[opType] ?? DECOMP_MAP.Compute;
    const n      = labels.length;

    labels.forEach((label, i) => {
      const frac = FRACTIONS[i];
      const cpu  = Math.max(1, Math.round(task.cpu * frac));
      const ram  = Math.max(1, Math.round(task.ram * frac));

      subTasks.push({
        id:                 `${task.id}__sub__${i}`,
        name:               `${task.name} · ${label}`,
        cpu,
        ram,
        duration:           task.duration,
        priority:           task.priority,
        operationType:      opType,
        /* BFD-compatible split fields */
        parentTaskId:       task.id,
        parentTaskName:     task.name,
        chunkIndex:         i + 1,
        totalChunks:        n,
        affinityGroup:      opType,
        preferredMachineId: null,   /* stamped by getAffinityAssignments */
      });
    });
  }

  return subTasks;
}

/* ── Machine scoring per operation type ─────────────────────── */
const AFFINITY_SCORE = {
  Arithmetic: m => m.cpu * 10 + m.ram,          /* maximize CPU              */
  Memory:     m => m.ram * 10 + m.cpu,          /* maximize RAM              */
  Compute:    m => m.cpu *  6 + m.ram * 4,      /* balanced, CPU-leaning     */
  'I/O':      m => (m.cpu + m.ram) * 5,         /* maximize total throughput */
  Render:     m => m.ram *  6 + m.cpu * 4,      /* RAM-leaning               */
};

/**
 * Compute an affinity map { [operationType]: machineId } by scoring
 * each online machine per operation type and picking the best.
 * Stamps preferredMachineId onto each sub-task.
 *
 * Returns { subTasks, affinityMap }.
 */
export function getAffinityAssignments(subTasks, machines) {
  const online = machines.filter(m => m.status !== 'Offline');
  if (online.length === 0) return { subTasks, affinityMap: {} };

  /* Collect unique operation types present in this batch */
  const opTypes = [...new Set(subTasks.map(s => s.affinityGroup))];

  const affinityMap = {};
  for (const opType of opTypes) {
    const scorer = AFFINITY_SCORE[opType] ?? AFFINITY_SCORE.Compute;
    let bestMachine = null;
    let bestScore   = -Infinity;

    for (const m of online) {
      const score = scorer(m);
      if (score > bestScore) { bestScore = score; bestMachine = m; }
    }

    if (bestMachine) affinityMap[opType] = bestMachine.id;
  }

  /* Stamp preferredMachineId onto each sub-task */
  const stamped = subTasks.map(s => ({
    ...s,
    preferredMachineId: affinityMap[s.affinityGroup] ?? null,
  }));

  return { subTasks: stamped, affinityMap };
}
