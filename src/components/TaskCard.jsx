import { PRIORITY_COLORS } from '../utils/prioritySort';

const PRIORITY_ICONS = {
  Critical: '🔴',
  High: '🟠',
  Medium: '🟡',
  Low: '🟢',
};

export default function TaskCard({ task, position, onRemove, locked }) {
  const colors = PRIORITY_COLORS[task.priority];

  return (
    <div
      className={`task-enter relative flex items-start gap-4 rounded-xl border ${colors.border} bg-slate-800/80 p-4 shadow-lg ${colors.glow} transition-all duration-300 hover:bg-slate-800`}
    >
      {/* Queue position badge */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-xs font-bold text-slate-300">
        {position}
      </div>

      {/* Task info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="font-semibold text-slate-100 text-sm truncate">{task.name}</span>
          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>
            {PRIORITY_ICONS[task.priority]} {task.priority}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="CPU" value={`${task.cpu} core${task.cpu !== 1 ? 's' : ''}`} icon="⚡" />
          <Stat label="RAM" value={`${task.ram} GB`} icon="🧠" />
          <Stat label="Duration" value={`${task.duration}s`} icon="⏱" />
        </div>
      </div>

      {/* Remove button */}
      {!locked && (
        <button
          onClick={() => onRemove(task.id)}
          className="flex-shrink-0 text-slate-500 hover:text-red-400 transition-colors duration-150 text-lg leading-none self-start"
          title="Remove task"
          aria-label={`Remove ${task.name}`}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function Stat({ label, value, icon }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{icon} {label}</span>
      <span className="text-xs text-slate-300 font-medium">{value}</span>
    </div>
  );
}
