import { useState } from 'react';
import TaskCard from './TaskCard';
import { saveTasks } from '../utils/apiClient';

const DEFAULT_MIN = 1;
const ABSOLUTE_MIN = 1;
const ABSOLUTE_MAX = 20;

export default function TaskQueue({ tasks, onRemove, onProceed, locked, sessionId, showToast }) {
  const [minTasks, setMinTasks] = useState(DEFAULT_MIN);

  const remaining  = Math.max(0, minTasks - tasks.length);
  const canProceed = tasks.length >= minTasks && !locked;

  function adjustMin(delta) {
    setMinTasks(n => Math.min(ABSOLUTE_MAX, Math.max(ABSOLUTE_MIN, n + delta)));
  }

  return (
    <div className="flex flex-col gap-4 h-full">

      {/* ── Header row ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-purple-400" />
          Priority Queue
        </h2>

        {/* Counter pill */}
        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${
            tasks.length >= minTasks
              ? 'bg-green-900/40 border-green-500/40 text-green-300'
              : 'bg-slate-700/60 border-slate-600 text-slate-400'
          }`}
        >
          {tasks.length} / {minTasks} tasks
          {remaining > 0 && ` · ${remaining} more needed`}
        </span>
      </div>

      {/* ── Task-count stepper ── */}
      {!locked && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-800/60 border border-slate-700/60 px-4 py-2.5">
          <div>
            <p className="text-xs font-semibold text-slate-300 leading-none">
              Tasks to schedule
            </p>
            <p className="text-[10px] text-slate-600 mt-0.5">
              Set how many tasks to add before proceeding
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => adjustMin(-1)}
              disabled={minTasks <= ABSOLUTE_MIN}
              className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-slate-200 font-bold text-sm flex items-center justify-center transition-all"
              aria-label="Decrease"
            >
              −
            </button>
            <span className="w-6 text-center text-sm font-bold font-mono text-slate-100 select-none">
              {minTasks}
            </span>
            <button
              onClick={() => adjustMin(1)}
              disabled={minTasks >= ABSOLUTE_MAX}
              className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-slate-200 font-bold text-sm flex items-center justify-center transition-all"
              aria-label="Increase"
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* ── Locked banner ── */}
      {locked && (
        <div className="banner-enter flex items-center gap-3 rounded-xl bg-green-900/30 border border-green-500/40 px-4 py-3">
          <span className="text-green-400 text-lg">✔</span>
          <p className="text-sm font-semibold text-green-300">
            Queue locked — {tasks.length} task{tasks.length !== 1 ? 's' : ''} ready for scheduling.
          </p>
        </div>
      )}

      {/* ── Task list ── */}
      <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-1">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500 text-center gap-3">
            <span className="text-4xl opacity-40">📋</span>
            <p className="text-sm">
              No tasks yet. Add at least {minTasks} task{minTasks !== 1 ? 's' : ''} to proceed.
            </p>
          </div>
        ) : (
          tasks.map((task, index) => (
            <TaskCard
              key={task.id}
              task={task}
              position={index + 1}
              onRemove={onRemove}
              locked={locked}
            />
          ))
        )}
      </div>

      {/* ── Proceed button ── */}
      <div className="pt-2 border-t border-slate-700">
        <button
          onClick={async () => {
            if (sessionId) {
              await saveTasks(sessionId, tasks);
              showToast?.('Tasks saved ✓');
            }
            onProceed();
          }}
          disabled={!canProceed}
          className={`w-full rounded-xl font-semibold py-3 text-sm transition-all duration-200 shadow-lg ${
            canProceed
              ? 'bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white shadow-purple-900/40 cursor-pointer'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          {locked
            ? '✔ Scheduling Queued'
            : canProceed
            ? '→ Proceed to Scheduling'
            : `Add ${remaining} more task${remaining !== 1 ? 's' : ''} to proceed`}
        </button>
      </div>
    </div>
  );
}
