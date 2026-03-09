/**
 * exportUtils.js
 * Browser download helpers for JSON and CSV export.
 * No React dependencies — pure DOM utilities.
 */

/** Create a temporary <a> element to trigger a file download, then clean up. */
function triggerDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download the raw schedulerResults array as a pretty-printed JSON file.
 * @param {Array}  results   The schedulerResults array from localStorage
 * @param {string} filename  Optional override (default: 'scheduler-results.json')
 */
export function exportJSON(results, filename = 'scheduler-results.json') {
  triggerDownload(JSON.stringify(results, null, 2), filename, 'application/json');
}

/**
 * Download task results as a flat CSV file.
 * Uses pre-computed relative start/end times (startRelS / endRelS) from
 * computeStats so the CSV shows meaningful wall-clock-relative values.
 *
 * @param {Array}  resultsWithRelTimes  Enriched result rows from computeStats()
 * @param {string} filename             Optional override (default: 'scheduler-results.csv')
 */
export function exportCSV(resultsWithRelTimes, filename = 'scheduler-results.csv') {
  /** Wrap a value in double-quotes, escaping any embedded quotes. */
  const q = val => `"${String(val ?? '').replace(/"/g, '""')}"`;

  const HEADERS = [
    'Task Name',
    'Machine',
    'CPU Allocated (cores)',
    'RAM Allocated (GB)',
    'Start Time (s)',
    'End Time (s)',
    'Duration (s)',
    'Status',
  ];

  const rows = resultsWithRelTimes.map(r => [
    q(r.taskName),
    q(r.machineName),
    r.cpuAllocated,
    r.ramAllocated,
    r.startRelS,
    r.endRelS,
    r.actualDuration,
    q(r.status),
  ].join(','));

  const csv = [HEADERS.join(','), ...rows].join('\r\n');
  triggerDownload(csv, filename, 'text/csv;charset=utf-8;');
}
