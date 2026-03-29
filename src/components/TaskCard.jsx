/**
 * TaskCard — displays a queued task.
 * Supports two task types: 'math' (blue) and 'image' (purple).
 */
export default function TaskCard({ task, position, onRemove, locked }) {
  const isMath = task.type === 'math';

  const border = isMath ? 'border-blue-500/30'   : 'border-purple-500/30';
  const glow   = isMath ? 'shadow-blue-500/10'   : 'shadow-purple-500/10';
  const badge  = isMath
    ? 'bg-blue-600/80 text-blue-100 border border-blue-500/40'
    : 'bg-purple-600/80 text-purple-100 border border-purple-500/40';

  return (
    <div
      className={`task-enter relative flex items-start gap-4 rounded-xl border ${border} bg-slate-800/80 p-4 shadow-lg ${glow} transition-all duration-300 hover:bg-slate-800`}
    >
      {/* Queue position badge */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-xs font-bold text-slate-300">
        {position}
      </div>

      {/* Task info */}
      <div className="flex-1 min-w-0">
        {/* Name + type badge */}
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="font-semibold text-slate-100 text-sm truncate">{task.name}</span>
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${badge}`}>
            {isMath ? '∑ Math' : '🖼 Image'}
          </span>
        </div>

        {/* Type-specific detail */}
        {isMath ? <MathDetail task={task} /> : <ImageDetail task={task} />}
      </div>

      {/* Remove button */}
      {!locked && (
        <button
          onClick={() => onRemove(task.id)}
          className="flex-shrink-0 text-slate-500 hover:text-red-400 transition-colors duration-150 text-lg leading-none self-start cursor-pointer"
          title="Remove task"
          aria-label={`Remove ${task.name}`}
        >
          ✕
        </button>
      )}
    </div>
  );
}

/* ── Math detail ──────────────────────────────────────────────────────────── */
function MathDetail({ task }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-mono text-blue-300 bg-blue-950/30 rounded px-2 py-1 border border-blue-700/20 truncate">
        {task.equation}
      </p>
      <div className="flex items-center gap-3 text-[10px] text-slate-500">
        <span>x: {task.xFrom} → {task.xTo}  step {task.xStep}</span>
        <span>·</span>
        <span>{task.totalPoints?.toLocaleString()} pts</span>
        <span>·</span>
        <span className="text-indigo-400">{task.estimatedCPU}c / {task.estimatedRAM} GB</span>
      </div>
    </div>
  );
}

/* ── Image detail ─────────────────────────────────────────────────────────── */
function ImageDetail({ task }) {
  const sizeKB = task.fileSize ? (task.fileSize / 1024).toFixed(0) : '?';

  return (
    <div className="flex items-center gap-3">
      {task.imageData && (
        <img
          src={task.imageData}
          alt={task.filename}
          className="w-12 h-12 rounded object-cover border border-slate-600 flex-shrink-0"
        />
      )}
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs text-slate-300 truncate font-medium">{task.filename}</p>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span>{task.width} × {task.height}px</span>
          <span>·</span>
          <span>{sizeKB} KB</span>
          <span>·</span>
          <span className="text-purple-400">{task.estimatedCPU}c / {task.estimatedRAM} GB</span>
        </div>
      </div>
    </div>
  );
}
