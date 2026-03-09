/**
 * computeStats.js
 * Pure functions for Phase 5 summary statistics.
 * No side-effects; all inputs come from localStorage data.
 */

/**
 * Compute all summary statistics from schedulerResults.
 *
 * @param {Array} results  Items from localStorage `schedulerResults`
 * @returns {object|null}  Full stats object, or null if results is empty
 */
export function computeStats(results) {
  if (!results || results.length === 0) return null;

  // ── Enrich with parsed timestamps ────────────────────────────────────────
  const withMs = results.map(r => ({
    ...r,
    startMs: new Date(r.startTime).getTime(),
    endMs:   new Date(r.endTime).getTime(),
  }));

  const firstStartMs  = Math.min(...withMs.map(r => r.startMs));
  const lastEndMs     = Math.max(...withMs.map(r => r.endMs));
  const totalWallClockS = +((lastEndMs - firstStartMs) / 1000).toFixed(1);

  // ── Enrich with relative times ────────────────────────────────────────────
  // startRelS / endRelS are seconds relative to firstStartMs
  const withRelTimes = withMs.map(r => ({
    ...r,
    startRelS: +((r.startMs - firstStartMs) / 1000).toFixed(1),
    endRelS:   +((r.endMs   - firstStartMs) / 1000).toFixed(1),
  }));

  // ── Basic aggregates ──────────────────────────────────────────────────────
  const totalDuration = results.reduce((s, r) => s + r.actualDuration, 0);
  const avgDuration   = +(totalDuration / results.length).toFixed(1);

  // ── Peak machine: most tasks assigned ─────────────────────────────────────
  const machineTaskCounts = {};
  results.forEach(r => {
    machineTaskCounts[r.machineName] = (machineTaskCounts[r.machineName] || 0) + 1;
  });
  const [peakMachineName, peakTaskCount] = Object.entries(machineTaskCounts)
    .sort(([, a], [, b]) => b - a)[0];

  // ── Scheduling efficiency score ───────────────────────────────────────────
  // Formula: (Σ task durations) / (unique_machines × wall_clock_time) × 100
  // Represents how "busy" the cluster was on average; capped at 100.
  const uniqueMachineIds    = [...new Set(results.map(r => r.machineId))];
  const uniqueMachineCount  = uniqueMachineIds.length;
  const rawScore = totalWallClockS > 0
    ? (totalDuration / uniqueMachineCount / totalWallClockS) * 100
    : 0;
  const efficiencyScore = Math.min(100, Math.round(rawScore));

  // ── Per-machine breakdown ─────────────────────────────────────────────────
  const machineMap = {};
  withRelTimes.forEach(r => {
    if (!machineMap[r.machineId]) {
      machineMap[r.machineId] = {
        machineId:       r.machineId,
        machineName:     r.machineName,
        tasks:           [],
        totalCpuSeconds: 0,
        totalRamSeconds: 0,
      };
    }
    machineMap[r.machineId].tasks.push(r);
    machineMap[r.machineId].totalCpuSeconds += r.cpuAllocated * r.actualDuration;
    machineMap[r.machineId].totalRamSeconds += r.ramAllocated * r.actualDuration;
  });

  // Sort tasks within each machine by start time; compute idle time
  Object.values(machineMap).forEach(m => {
    m.tasks.sort((a, b) => a.startRelS - b.startRelS);
    const busyTime = m.tasks.reduce((s, t) => s + t.actualDuration, 0);
    m.idleTime = +Math.max(0, totalWallClockS - busyTime).toFixed(1);
    m.totalCpuSeconds = +m.totalCpuSeconds.toFixed(1);
    m.totalRamSeconds = +m.totalRamSeconds.toFixed(1);
  });

  const machineBreakdown = Object.values(machineMap)
    .sort((a, b) => b.tasks.length - a.tasks.length); // most-loaded first

  return {
    totalWallClockS,
    avgDuration,
    peakMachine:        { name: peakMachineName, count: peakTaskCount },
    efficiencyScore,
    uniqueMachineCount,
    totalTasks:         results.length,
    machineBreakdown,
    resultsWithRelTimes: withRelTimes,
    firstStartMs,
  };
}

/**
 * Colour theme for the efficiency score ring and label.
 * @param {number} score  0–100
 * @returns {{ stroke, text, label, border, bg }}
 */
export function getEfficiencyColor(score) {
  if (score >= 70) return {
    stroke: '#22c55e',
    text:   'text-green-400',
    label:  'Excellent',
    border: 'border-green-700/30',
    bg:     'bg-green-900/10',
  };
  if (score >= 40) return {
    stroke: '#eab308',
    text:   'text-yellow-400',
    label:  'Good',
    border: 'border-yellow-700/30',
    bg:     'bg-yellow-900/10',
  };
  return {
    stroke: '#ef4444',
    text:   'text-red-400',
    label:  'Low',
    border: 'border-red-700/30',
    bg:     'bg-red-900/10',
  };
}
