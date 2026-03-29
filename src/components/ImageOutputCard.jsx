import { useState, useEffect, useRef, useCallback } from 'react';

/* Per-machine colors matching MathOutputCard */
const MACHINE_COLORS = {
  'Node-Alpha':   '#60a5fa',
  'Node-Beta':    '#34d399',
  'Node-Gamma':   '#f59e0b',
  'Node-Delta':   '#f87171',
  'Node-Epsilon': '#a78bfa',
};
const FALLBACK_COLORS = ['#6366f1', '#a855f7', '#06b6d4', '#10b981', '#f59e0b'];

function machineColor(machineId, idx = 0) {
  return MACHINE_COLORS[machineId] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

/**
 * ImageOutputCard
 *
 * Props:
 *   task            {object}  schedulerTasks entry (imageData, filename, width, height, fileSize)
 *   result          {object}  schedulerResults entry (machineName, actualDuration, grayscaleData?)
 *   strips          {Array}   Live strips: [{ stripIndex, machineId, machineName, grayscaleStrip, duration }]
 *   finalImage      {string}  data-URL of stitched grayscale (from image_complete WS event)
 *   stripProgress   {object}  { received: N, total: M }
 *   assignments     {Array}   Task assignments for this taskId (for pre-strip machine labels)
 */
export default function ImageOutputCard({
  task,
  result,
  strips        = [],
  finalImage:   finalImageProp,
  stripProgress,
  assignments   = [],
}) {
  /* ── Resolve final image ─────────────────────────────────────────────────
     Priority: live WS image_complete > stored result.grayscaleData > fallback
  ─────────────────────────────────────────────────────────────────────────── */
  const finalImage = finalImageProp ?? result?.grayscaleData ?? null;

  /* totalStrips: from stripProgress, first received strip, or default to assignments count */
  const totalStrips = stripProgress?.total
    ?? strips[0]?.totalStrips
    ?? Math.max(assignments.length, 1);

  const isDone    = !!finalImage;
  const isLive    = strips.length > 0;

  /* ── Comparison slider ────────────────────────────────────────────────── */
  const [sliderPos, setSliderPos] = useState(50);
  const showComparison = !!(task?.imageData && finalImage);

  /* ── Flash animation tracking ─────────────────────────────────────────── */
  const [flashSet, setFlashSet] = useState(new Set());
  const prevStripsLen = useRef(0);

  useEffect(() => {
    if (strips.length <= prevStripsLen.current) return;
    const newest = strips[strips.length - 1];
    if (!newest) return;
    const idx = newest.stripIndex;
    setFlashSet(prev => new Set([...prev, idx]));
    const t = setTimeout(() => {
      setFlashSet(prev => { const n = new Set(prev); n.delete(idx); return n; });
    }, 1400);
    prevStripsLen.current = strips.length;
    return () => clearTimeout(t);
  }, [strips.length]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Stats ────────────────────────────────────────────────────────────── */
  const sizeKB       = task?.fileSize ? (task.fileSize / 1024).toFixed(0) : null;
  const totalDurS    = result?.actualDuration ?? null;
  const machineCount = new Set(strips.map(s => s.machineId)).size || (result?.machineName ? 1 : 0);

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none select-none">🖼</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-100 leading-snug">
            {task?.name ?? 'Image Task'}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{task?.filename ?? '—'}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {task?.width && task?.height && (
              <span className="text-[10px] text-slate-500 font-mono">
                {task.width} × {task.height}px
              </span>
            )}
            {sizeKB && (
              <span className="text-[10px] text-slate-500 font-mono">{sizeKB} KB</span>
            )}
            {stripProgress && (
              <span className={`text-[10px] font-mono ${
                stripProgress.received >= stripProgress.total
                  ? 'text-green-400'
                  : 'text-amber-400'
              }`}>
                {stripProgress.received < stripProgress.total
                  ? `Strip ${stripProgress.received}/${stripProgress.total} processed`
                  : `${stripProgress.total} strip${stripProgress.total !== 1 ? 's' : ''} complete`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Three-panel layout ── */}
      <div className="grid grid-cols-3 gap-3">

        {/* ── Left: Original with strip dividers ── */}
        <PanelShell label="Original">
          {task?.imageData ? (
            <div className="relative h-full">
              <img
                src={task.imageData}
                alt="original"
                className="w-full h-full object-cover rounded-lg"
              />
              {/* Strip divider lines */}
              {Array.from({ length: totalStrips - 1 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-t border-dashed border-blue-400/60 pointer-events-none"
                  style={{ top: `${((i + 1) / totalStrips) * 100}%` }}
                />
              ))}
              {/* Strip labels */}
              {Array.from({ length: totalStrips }).map((_, i) => {
                const strip      = strips.find(s => s.stripIndex === i);
                const assignment = assignments[i];
                const machine    = strip?.machineName ?? strip?.machineId
                                ?? assignment?.machineName ?? assignment?.machineId;
                return (
                  <div
                    key={i}
                    className="absolute left-1 flex items-center gap-1 pointer-events-none"
                    style={{ top: `calc(${(i / totalStrips) * 100}% + 3px)` }}
                  >
                    <span
                      className="text-[8px] font-bold px-1 py-px rounded font-mono leading-none"
                      style={{
                        background: 'rgba(0,0,0,0.65)',
                        color: machine ? machineColor(machine, i) : '#94a3b8',
                      }}
                    >
                      {i + 1}{machine ? ` → ${machine.replace('Node-', '')}` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptySlot text="No image" />
          )}
        </PanelShell>

        {/* ── Middle: Live processing strips ── */}
        <PanelShell label="Processing">
          <div className="flex flex-col h-full gap-px">
            {Array.from({ length: totalStrips }).map((_, i) => {
              const strip      = strips.find(s => s.stripIndex === i);
              const assignment = assignments[i];
              const machine    = strip?.machineName ?? strip?.machineId
                              ?? assignment?.machineName ?? assignment?.machineId;
              const color      = machineColor(machine ?? '', i);
              const isFlashing = flashSet.has(i);

              return (
                <div
                  key={i}
                  className="relative flex-1 overflow-hidden rounded transition-all duration-300"
                  style={{
                    boxShadow: isFlashing ? `0 0 10px 2px ${color}55` : 'none',
                    outline:   isFlashing ? `1.5px solid ${color}` : 'none',
                  }}
                >
                  {strip ? (
                    <>
                      <img
                        src={`data:image/png;base64,${strip.grayscaleStrip}`}
                        alt={`strip ${i}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-0.5 right-0.5 flex items-center gap-1 bg-green-950/90 border border-green-700/50 rounded px-1.5 py-px">
                        <span className="text-green-400 text-[8px] font-bold">✓</span>
                        <span className="text-green-300 text-[8px] font-mono truncate max-w-[80px]">
                          {machine?.replace('Node-', '') ?? ''}
                        </span>
                        {strip.duration != null && (
                          <span className="text-green-600 text-[8px] font-mono">
                            {strip.duration}s
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-900/70">
                      <div className="flex items-center gap-1.5">
                        {machine && (
                          <span
                            className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0"
                            style={{ backgroundColor: color }}
                          />
                        )}
                        <span className="text-[9px] font-mono text-slate-600">
                          {machine
                            ? `${machine.replace('Node-', '')} · Processing…`
                            : `Strip ${i + 1} · Awaiting…`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </PanelShell>

        {/* ── Right: Final assembled result ── */}
        <PanelShell label="Final Result">
          {isDone ? (
            <div className="relative h-full">
              <img
                src={finalImage}
                alt="grayscale result"
                className="w-full h-full object-cover rounded-lg"
                style={{ animation: 'fadein 0.5s ease' }}
              />
              <div className="absolute bottom-1 left-1 right-1 flex items-center justify-center gap-1.5
                              bg-green-950/90 border border-green-700/40 rounded px-2 py-1">
                <span className="text-green-400 text-[9px] font-bold">✓</span>
                <span className="text-green-300 text-[9px] font-semibold">Assembly complete</span>
              </div>
            </div>
          ) : (
            <EmptySlot text="Awaiting all strips…" pulse />
          )}
        </PanelShell>
      </div>

      {/* ── Assembly stats ── */}
      {isDone && (
        <div className="flex flex-wrap gap-4 pt-3 border-t border-slate-700/40">
          {task?.width && task?.height && (
            <StatPill label="Original size" value={`${task.width} × ${task.height}px`} />
          )}
          {machineCount > 0 && (
            <StatPill label="Machines used" value={`${machineCount}`} />
          )}
          {totalDurS != null && (
            <StatPill label="Total time" value={`${totalDurS}s`} />
          )}
          {result?.machineName && machineCount <= 1 && (
            <StatPill label="Worker node" value={result.machineName} />
          )}
        </div>
      )}

      {/* ── Comparison slider ── */}
      {showComparison && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
              Comparison
            </span>
            <div className="flex-1 h-px bg-slate-700/40" />
            <span className="text-[9px] text-slate-600 font-mono">drag to compare</span>
          </div>

          <div
            className="relative overflow-hidden rounded-xl border border-slate-700 bg-slate-950 select-none"
            style={{ height: 200 }}
          >
            {/* Back: grayscale (full width) */}
            <img
              src={finalImage}
              alt="grayscale"
              className="absolute inset-0 w-full h-full object-contain"
              draggable={false}
            />

            {/* Front: color, clipped to left portion */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
            >
              <img
                src={task.imageData}
                alt="original color"
                className="absolute inset-0 w-full h-full object-contain"
                draggable={false}
              />
            </div>

            {/* Divider line */}
            <div
              className="absolute top-0 bottom-0 w-px bg-white/80 pointer-events-none"
              style={{ left: `${sliderPos}%` }}
            />

            {/* Handle knob */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white shadow-lg
                         flex items-center justify-center pointer-events-none z-10"
              style={{ left: `calc(${sliderPos}% - 14px)` }}
            >
              <span className="text-slate-700 text-[10px] font-bold leading-none select-none">⟺</span>
            </div>

            {/* Labels */}
            <div className="absolute top-1.5 left-2 text-[9px] font-semibold text-white/90
                            bg-black/50 px-1.5 py-0.5 rounded pointer-events-none">
              Color
            </div>
            <div className="absolute top-1.5 right-2 text-[9px] font-semibold text-white/90
                            bg-black/50 px-1.5 py-0.5 rounded pointer-events-none">
              Grayscale
            </div>

            {/* Transparent range input captures drag */}
            <input
              type="range"
              min={0}
              max={100}
              value={sliderPos}
              onChange={e => setSliderPos(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────────────────────────── */

function PanelShell({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">{label}</p>
      <div className="flex-1 rounded-lg overflow-hidden bg-slate-900/50 border border-slate-700/50"
           style={{ height: 220 }}>
        {children}
      </div>
    </div>
  );
}

function EmptySlot({ text, pulse = false }) {
  return (
    <div className={`w-full h-full flex items-center justify-center text-slate-600 text-xs
                     ${pulse ? 'animate-pulse' : ''}`}>
      {text}
    </div>
  );
}

function StatPill({ label, value }) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[9px] uppercase tracking-widest text-slate-600 font-semibold mb-0.5">
        {label}
      </span>
      <span className="text-xs text-slate-300 font-mono truncate">{value}</span>
    </div>
  );
}
