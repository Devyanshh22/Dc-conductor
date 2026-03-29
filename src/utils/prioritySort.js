/**
 * sortTasks — sorts tasks by type (math first, then image), then by name.
 */
export function sortTasks(tasks) {
  const TYPE_ORDER = { math: 0, image: 1 };
  return [...tasks].sort((a, b) => {
    const tDiff = (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99);
    if (tDiff !== 0) return tDiff;
    return a.name.localeCompare(b.name);
  });
}
