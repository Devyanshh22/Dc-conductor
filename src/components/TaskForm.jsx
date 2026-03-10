import { useState } from 'react';

const EMPTY_FORM = {
  name: '',
  cpu: '',
  ram: '',
  priority: 'Medium',
  duration: '',
};

/* Largest single machine in the default fleet — tasks above this need splitting */
const SINGLE_MACHINE_MAX_CPU = 16;
const SINGLE_MACHINE_MAX_RAM = 64;

export default function TaskForm({ onAddTask, locked }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  const cpuVal = Number(form.cpu);
  const ramVal = Number(form.ram);
  const needsSplit = (cpuVal > SINGLE_MACHINE_MAX_CPU || ramVal > SINGLE_MACHINE_MAX_RAM)
    && cpuVal >= 1 && ramVal >= 1;

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = 'Task name is required.';
    const cpu = Number(form.cpu);
    if (!form.cpu || cpu < 1 || cpu > 128) e.cpu = 'Enter 1–128 cores.';
    const ram = Number(form.ram);
    if (!form.ram || ram < 1 || ram > 512) e.ram = 'Enter 1–512 GB.';
    const dur = Number(form.duration);
    if (!form.duration || dur < 1 || dur > 60) e.duration = 'Enter 1–60 seconds.';
    return e;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const e2 = validate();
    if (Object.keys(e2).length) { setErrors(e2); return; }
    setErrors({});
    onAddTask({
      id: crypto.randomUUID(),
      name: form.name.trim(),
      cpu: Number(form.cpu),
      ram: Number(form.ram),
      priority: form.priority,
      duration: Number(form.duration),
    });
    setForm(EMPTY_FORM);
  }

  function field(key, value) {
    setForm(f => ({ ...f, [key]: value }));
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }));
  }

  const inputBase =
    'w-full rounded-lg bg-slate-700/60 border border-slate-600 px-3 py-2 text-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition disabled:opacity-40 disabled:cursor-not-allowed';
  const labelBase = 'block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1';
  const errorText = 'text-red-400 text-xs mt-1';

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-slate-800 rounded-2xl border border-slate-700 p-6 shadow-xl flex flex-col gap-5"
    >
      <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-indigo-400"></span>
        New Task
      </h2>

      {/* Task Name */}
      <div>
        <label className={labelBase}>Task Name</label>
        <input
          type="text"
          placeholder="e.g. Matrix Multiplication"
          className={inputBase}
          value={form.name}
          onChange={e => field('name', e.target.value)}
          disabled={locked}
          maxLength={60}
        />
        {errors.name && <p className={errorText}>{errors.name}</p>}
      </div>

      {/* CPU + RAM row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelBase}>CPU Cores</label>
          <input
            type="number"
            min={1} max={128}
            placeholder="1–128"
            className={inputBase}
            value={form.cpu}
            onChange={e => field('cpu', e.target.value)}
            disabled={locked}
          />
          {errors.cpu && <p className={errorText}>{errors.cpu}</p>}
        </div>
        <div>
          <label className={labelBase}>RAM (GB)</label>
          <input
            type="number"
            min={1} max={512}
            placeholder="1–512"
            className={inputBase}
            value={form.ram}
            onChange={e => field('ram', e.target.value)}
            disabled={locked}
          />
          {errors.ram && <p className={errorText}>{errors.ram}</p>}
        </div>
      </div>

      {/* Splitting badge — shown when task exceeds single-machine max */}
      {needsSplit && (
        <div className="flex items-center gap-2 rounded-lg bg-orange-900/20 border border-orange-500/30 px-3 py-2">
          <span className="text-orange-400 text-sm flex-shrink-0">⚡</span>
          <p className="text-[11px] text-orange-300 leading-snug">
            <span className="font-bold">Multi-machine split required.</span>{' '}
            This task exceeds any single machine's capacity ({SINGLE_MACHINE_MAX_CPU}c / {SINGLE_MACHINE_MAX_RAM} GB)
            and will be split across multiple nodes.
          </p>
        </div>
      )}

      {/* Priority */}
      <div>
        <label className={labelBase}>Priority Level</label>
        <select
          className={inputBase}
          value={form.priority}
          onChange={e => field('priority', e.target.value)}
          disabled={locked}
        >
          {['Critical', 'High', 'Medium', 'Low'].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* Duration */}
      <div>
        <label className={labelBase}>Est. Duration (seconds)</label>
        <input
          type="number"
          min={1} max={60}
          placeholder="1–60"
          className={inputBase}
          value={form.duration}
          onChange={e => field('duration', e.target.value)}
          disabled={locked}
        />
        {errors.duration && <p className={errorText}>{errors.duration}</p>}
      </div>

      <button
        type="submit"
        disabled={locked}
        className="mt-1 w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold py-2.5 text-sm transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-900/30"
      >
        + Add Task
      </button>
    </form>
  );
}
