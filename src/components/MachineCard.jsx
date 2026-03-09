const TYPE_BADGE = {
  'High Performance': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'General Purpose':  'bg-blue-500/20   text-blue-300   border-blue-500/30',
  'Low Power':        'bg-teal-500/20   text-teal-300   border-teal-500/30',
  'Minimal':          'bg-slate-600/30  text-slate-400  border-slate-600/40',
};

const STATUS_BADGE = {
  Idle:    'bg-green-500/15  text-green-300  border-green-500/30',
  Busy:    'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  Offline: 'bg-red-500/15   text-red-300    border-red-500/30',
};

export default function MachineCard({ machine, isScanning, isScanned, onToggle }) {
  const isOffline = machine.status === 'Offline';
  const availCpu  = isOffline ? 0 : machine.cpu;
  const availRam  = isOffline ? 0 : machine.ram;
  const cpuPct    = (availCpu / machine.cpu) * 100;
  const ramPct    = (availRam / machine.ram) * 100;

  /* Border / background depending on scan state */
  let wrapClass = 'relative overflow-hidden rounded-xl border p-4 transition-all duration-500 ';
  if (isScanning) {
    wrapClass += 'machine-scanning border-indigo-500/60 bg-slate-800 ';
  } else if (isScanned) {
    wrapClass += isOffline
      ? 'border-slate-700 bg-slate-800/50 '
      : 'border-indigo-500/25 bg-slate-800/90 shadow-lg shadow-indigo-950/30 ';
  } else {
    wrapClass += 'border-slate-700 bg-slate-800/60 ';
  }

  return (
    <div className={wrapClass}>
      {/* Horizontal sweep line during scan */}
      {isScanning && <div className="machine-sweep-line" />}

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-1 gap-2">
        <span className="font-mono font-bold text-slate-100 text-sm tracking-wide leading-snug">
          {machine.name}
          {/* Post-scan verified tick */}
          {isScanned && !isScanning && (
            <span
              className={`ml-1.5 text-[11px] font-bold ${
                isOffline ? 'text-red-400' : 'text-green-400'
              }`}
            >
              {isOffline ? '✗' : '✓'}
            </span>
          )}
        </span>

        <span
          className={`flex-shrink-0 text-[11px] px-2 py-0.5 rounded-full border font-semibold ${
            STATUS_BADGE[machine.status]
          }`}
        >
          {machine.status}
        </span>
      </div>

      {/* Type badge */}
      <span
        className={`text-[10px] px-2 py-0.5 rounded-full border inline-block mb-3 font-medium ${
          TYPE_BADGE[machine.type]
        }`}
      >
        {machine.type}
      </span>

      {/* ── CPU bar ── */}
      <div className="mb-2">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            CPU
          </span>
          <span className="text-[11px] font-mono text-slate-300">
            {availCpu} / {machine.cpu} cores
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-700"
            style={{ width: `${cpuPct}%` }}
          />
        </div>
      </div>

      {/* ── RAM bar ── */}
      <div className="mb-2">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            RAM
          </span>
          <span className="text-[11px] font-mono text-slate-300">
            {availRam} / {machine.ram} GB
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-purple-500 transition-all duration-700"
            style={{ width: `${ramPct}%` }}
          />
        </div>
      </div>

      {/* ── Uptime ── */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-700/50 mb-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-600">
          Uptime
        </span>
        <span className="text-xs font-mono text-slate-400">{machine.uptime}</span>
      </div>

      {/* ── Online / Offline toggle ── */}
      {onToggle && (
        <button
          onClick={() => onToggle(machine.id)}
          className={`
            w-full text-[11px] font-semibold px-3 py-1.5 rounded-lg
            border transition-all duration-200
            ${isOffline
              ? 'bg-green-900/20 text-green-400 border-green-600/30 hover:bg-green-900/40'
              : 'bg-slate-700/40 text-slate-400 border-slate-600/40 hover:bg-red-900/20 hover:text-red-400 hover:border-red-600/30'
            }
          `}
        >
          {isOffline ? '↑ Bring Online' : '↓ Set Offline'}
        </button>
      )}

      {/* Offline dimmer overlay */}
      {isOffline && (
        <div className="absolute inset-0 bg-slate-900/30 rounded-xl pointer-events-none" />
      )}
    </div>
  );
}
