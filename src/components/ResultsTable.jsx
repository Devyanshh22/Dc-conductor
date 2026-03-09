import { useState, useMemo } from 'react';

/**
 * ResultsTable
 * Sortable full-results table for the Output Dashboard.
 * Default sort: End Time ascending.
 *
 * Props:
 *   results {Array}  resultsWithRelTimes from computeStats()
 */

const COLUMNS = [
  { key: 'taskName',       label: 'Task Name',   align: 'left',   mono: false },
  { key: 'machineName',    label: 'Machine',     align: 'left',   mono: true  },
  { key: 'cpuAllocated',   label: 'CPU',         align: 'right',  mono: true  },
  { key: 'ramAllocated',   label: 'RAM',         align: 'right',  mono: true  },
  { key: 'startRelS',      label: 'Start',       align: 'right',  mono: true  },
  { key: 'endRelS',        label: 'End',         align: 'right',  mono: true  },
  { key: 'actualDuration', label: 'Duration',    align: 'right',  mono: true  },
  { key: 'status',         label: 'Status',      align: 'center', mono: false },
];

const CELL_VALUE = {
  cpuAllocated:   v => `${v}c`,
  ramAllocated:   v => `${v} GB`,
  startRelS:      v => `${v}s`,
  endRelS:        v => `${v}s`,
  actualDuration: v => `${v}s`,
  status:         () => null,   // rendered specially
};

export default function ResultsTable({ results }) {
  const [sortKey, setSortKey] = useState('endRelS');
  const [sortDir, setSortDir] = useState('asc');

  const toggleSort = key => {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    return [...results].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av ?? 0) - (bv ?? 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [results, sortKey, sortDir]);

  return (
    <div className="rounded-xl border border-slate-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">

          {/* ── Head ── */}
          <thead>
            <tr className="bg-slate-800/80">
              {COLUMNS.map(col => {
                const active = sortKey === col.key;
                const alignClass =
                  col.align === 'right'  ? 'text-right'  :
                  col.align === 'center' ? 'text-center' : 'text-left';
                return (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className={`
                      px-4 py-3 font-medium cursor-pointer select-none
                      transition-colors duration-100 whitespace-nowrap
                      text-[10px] uppercase tracking-widest ${alignClass}
                      ${active
                        ? 'text-indigo-400 bg-indigo-950/30'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/30'}
                    `}
                  >
                    <span
                      className={`
                        inline-flex items-center gap-1
                        ${col.align === 'right'  ? 'justify-end'    : ''}
                        ${col.align === 'center' ? 'justify-center' : ''}
                      `}
                    >
                      {col.label}
                      {active
                        ? <span className="text-indigo-400 text-xs leading-none">
                            {sortDir === 'asc' ? '↑' : '↓'}
                          </span>
                        : <span className="text-slate-700 text-xs leading-none">↕</span>}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* ── Body ── */}
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={row.taskId}
                className={`
                  border-t border-slate-700/40
                  transition-colors duration-100 hover:bg-slate-700/25
                  ${i % 2 === 0 ? 'bg-slate-800/10' : 'bg-slate-800/30'}
                `}
              >
                {/* Task Name */}
                <td className="px-4 py-2.5 font-semibold text-slate-200 whitespace-nowrap">
                  {row.taskName}
                </td>

                {/* Machine */}
                <td className="px-4 py-2.5 font-mono text-xs text-slate-400 whitespace-nowrap">
                  {row.machineName}
                </td>

                {/* CPU */}
                <td className="px-4 py-2.5 text-right font-mono text-indigo-400 text-xs">
                  {row.cpuAllocated}c
                </td>

                {/* RAM */}
                <td className="px-4 py-2.5 text-right font-mono text-purple-400 text-xs">
                  {row.ramAllocated} GB
                </td>

                {/* Start */}
                <td className="px-4 py-2.5 text-right font-mono text-slate-500 text-xs">
                  {row.startRelS}s
                </td>

                {/* End */}
                <td className="px-4 py-2.5 text-right font-mono text-slate-400 text-xs">
                  {row.endRelS}s
                </td>

                {/* Duration */}
                <td className="px-4 py-2.5 text-right font-mono font-bold text-cyan-400 text-xs">
                  {row.actualDuration}s
                </td>

                {/* Status badge */}
                <td className="px-4 py-2.5 text-center">
                  <span className="
                    inline-flex items-center gap-1
                    text-[10px] font-medium
                    bg-green-900/25 text-green-400 border border-green-700/40
                    px-2 py-0.5 rounded-full whitespace-nowrap
                  ">
                    <span className="text-[8px]">✓</span> Completed
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
