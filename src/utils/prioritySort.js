const PRIORITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };

/**
 * Sorts tasks by priority (Critical → High → Medium → Low),
 * with ties broken by CPU required (descending).
 */
export function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (pDiff !== 0) return pDiff;
    return b.cpu - a.cpu;
  });
}

export const PRIORITY_COLORS = {
  Critical: {
    badge: 'bg-red-500 text-white',
    border: 'border-red-500/40',
    glow: 'shadow-red-500/10',
  },
  High: {
    badge: 'bg-orange-500 text-white',
    border: 'border-orange-500/40',
    glow: 'shadow-orange-500/10',
  },
  Medium: {
    badge: 'bg-yellow-500 text-black',
    border: 'border-yellow-500/40',
    glow: 'shadow-yellow-500/10',
  },
  Low: {
    badge: 'bg-green-500 text-white',
    border: 'border-green-500/40',
    glow: 'shadow-green-500/10',
  },
};
