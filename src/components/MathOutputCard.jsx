import { useMemo } from 'react';
import { evaluate } from 'mathjs';
import {
  ComposedChart, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

/* Per-machine colors */
const MACHINE_COLOR_MAP = {
  'Node-Alpha':   '#60a5fa',
  'Node-Beta':    '#34d399',
  'Node-Gamma':   '#f59e0b',
  'Node-Delta':   '#f87171',
  'Node-Epsilon': '#a78bfa',
};
const FALLBACK_COLORS = ['#6366f1', '#a855f7', '#06b6d4', '#10b981', '#f59e0b'];

function getMachineColor(machineId, fallbackIndex = 0) {
  return MACHINE_COLOR_MAP[machineId] ?? FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length];
}

/**
 * MathOutputCard
 *
 * Props:
 *   task            {object}  Full task object (equation, xFrom, xTo, xStep, name)
 *   result          {object}  Result from schedulerResults (machineName, actualDuration, mathResults?)
 *   segments        {Array}   Explicit live segments: [{ machineId, points: [{x, y}] }]
 *                             If omitted, derived from result.mathResults (single-machine)
 *   segmentProgress {object}  { received: N, total: M } — shows Computing… badge
 */
export default function MathOutputCard({ task, result, segments: segmentsProp, segmentProgress }) {

  /* ── Normalise segments ────────────────────────────────────────────────── */
  const segments = useMemo(() => {
    if (segmentsProp && segmentsProp.length > 0) return segmentsProp;
    /* Fall back to result.mathResults (saved from WS task_complete) */
    if (result?.mathResults?.length > 0) {
      return [{ machineId: result.machineId ?? result.machineName ?? 'Worker', points: result.mathResults }];
    }
    return [];
  }, [segmentsProp, result]);

  const hasLiveSegments = segments.length > 0;
  const isComputing     = segmentProgress && segmentProgress.received < segmentProgress.total;

  /* ── Fallback: evaluate equation locally (offline / simulated mode) ────── */
  const computedPoints = useMemo(() => {
    if (hasLiveSegments || !task?.equation) return [];
    const from = Number(task.xFrom ?? -50);
    const to   = Number(task.xTo   ??  50);
    const step = Number(task.xStep ??   1);
    if (step <= 0 || to <= from) return [];

    const pts = [];
    for (let x = from; x <= to + step * 0.001; x += step) {
      const xr = +x.toFixed(10);
      try {
        const raw = evaluate(task.equation, { x: xr });
        const y   = typeof raw === 'number' ? raw : Number(raw);
        if (isFinite(y)) pts.push({ x: +xr.toFixed(4), y: +y.toFixed(6) });
      } catch { /* skip */ }
    }
    return pts;
  }, [task, hasLiveSegments]);

  /* ── Chart data: merge segments onto a shared x-axis ──────────────────── */
  const chartData = useMemo(() => {
    if (!hasLiveSegments) return computedPoints;
    const xMap = new Map();
    for (const seg of segments) {
      for (const { x, y } of seg.points) {
        const key = +x.toFixed(6);
        if (!xMap.has(key)) xMap.set(key, { x: key });
        xMap.get(key)[seg.machineId] = +y.toFixed(6);
      }
    }
    return Array.from(xMap.values()).sort((a, b) => a.x - b.x);
  }, [segments, hasLiveSegments, computedPoints]);

  /* ── Stats ────────────────────────────────────────────────────────────── */
  const { minY, maxY, roots, totalPoints } = useMemo(() => {
    const allPts = hasLiveSegments
      ? segments.flatMap(s => s.points).sort((a, b) => a.x - b.x)
      : computedPoints;
    if (allPts.length === 0) return { minY: 0, maxY: 0, roots: [], totalPoints: 0 };

    const ys   = allPts.map(p => p.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const roots = [];
    for (let i = 0; i < allPts.length - 1; i++) {
      if (allPts[i].y * allPts[i + 1].y <= 0 && allPts[i + 1].y !== allPts[i].y) {
        const dx   = allPts[i + 1].x - allPts[i].x;
        const root = allPts[i].x + dx * (-allPts[i].y / (allPts[i + 1].y - allPts[i].y));
        roots.push(+root.toFixed(3));
      }
    }
    return { minY, maxY, roots, totalPoints: allPts.length };
  }, [segments, hasLiveSegments, computedPoints]);

  const fallbackColor = getMachineColor(result?.machineId ?? result?.machineName);
  const hasPoints     = chartData.length > 0;

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-6">

      {/* Header */}
      <div className="flex items-start gap-3 mb-5">
        <span className="text-2xl leading-none select-none">∑</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-100 leading-snug">
              {task?.name ?? 'Math Task'}
            </h3>
            {isComputing && (
              <span className="flex items-center gap-1 text-[10px] text-amber-400 font-mono">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Computing…
              </span>
            )}
            {segmentProgress && !isComputing && (
              <span className="text-[10px] text-green-400 font-mono">
                {segmentProgress.received}/{segmentProgress.total}{' '}
                segment{segmentProgress.total !== 1 ? 's' : ''} received
              </span>
            )}
          </div>
          <p className="text-xs font-mono text-blue-300 mt-1 truncate">
            f(x) = {task?.equation ?? '—'}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            x ∈ [{task?.xFrom}, {task?.xTo}] · step {task?.xStep}
            {!hasLiveSegments && result?.machineName && ` · ${result.machineName}`}
          </p>
        </div>

        {/* Machine color dot(s) */}
        <div className="flex gap-1 flex-shrink-0 mt-0.5">
          {hasLiveSegments
            ? segments.map((seg, i) => (
                <span
                  key={seg.machineId}
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: getMachineColor(seg.machineId, i) }}
                  title={seg.machineId}
                />
              ))
            : result?.machineName && (
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: fallbackColor }}
                  title={result.machineName}
                />
              )
          }
        </div>
      </div>

      {/* Chart */}
      {isComputing && !hasPoints ? (
        <div className="h-60 flex flex-col items-center justify-center rounded-xl bg-slate-900/40 border border-slate-700/40 gap-3">
          <div className="flex gap-1.5">
            {[0, 1, 2, 3].map(i => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
          <p className="text-slate-500 text-sm">Computing…</p>
        </div>
      ) : hasPoints ? (
        <div className="h-60 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
              <XAxis
                dataKey="x"
                tick={{ fontSize: 10, fill: '#64748b' }}
                tickCount={7}
                tickFormatter={v => v}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#64748b' }}
                width={58}
                tickFormatter={v => v.toFixed(1)}
              />
              <Tooltip
                contentStyle={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  fontSize: 11,
                  padding: '6px 10px',
                }}
                formatter={(v, name) => [v != null ? v.toFixed(4) : '—', name]}
                labelFormatter={x => `x = ${x}`}
              />
              <ReferenceLine y={0} stroke="#334155" strokeDasharray="3 3" />

              {hasLiveSegments
                ? segments.map((seg, i) => (
                    <Line
                      key={seg.machineId}
                      type="monotone"
                      dataKey={seg.machineId}
                      name={seg.machineId}
                      stroke={getMachineColor(seg.machineId, i)}
                      dot={false}
                      strokeWidth={2}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  ))
                : (
                    <Line
                      type="monotone"
                      dataKey="y"
                      stroke={fallbackColor}
                      dot={false}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  )
              }
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-60 flex items-center justify-center rounded-xl bg-slate-900/40 border border-slate-700/40">
          <p className="text-slate-600 text-sm">
            Could not evaluate equation — check the syntax
          </p>
        </div>
      )}

      {/* Multi-machine legend */}
      {hasLiveSegments && segments.length > 1 && (
        <div className="flex flex-wrap gap-4 mt-3">
          {segments.map((seg, i) => (
            <div key={seg.machineId} className="flex items-center gap-1.5">
              <span
                className="inline-block w-5 h-0.5 rounded"
                style={{ backgroundColor: getMachineColor(seg.machineId, i) }}
              />
              <span className="text-[10px] text-slate-400">{seg.machineId}</span>
            </div>
          ))}
        </div>
      )}

      {/* Stats row */}
      <div className="flex flex-wrap gap-4 mt-5 pt-4 border-t border-slate-700/50">
        <StatPill label="Points"    value={(totalPoints || 0).toLocaleString()} />
        <StatPill label="Min Y"     value={isFinite(minY) && totalPoints > 0 ? minY.toFixed(3) : '—'} />
        <StatPill label="Max Y"     value={isFinite(maxY) && totalPoints > 0 ? maxY.toFixed(3) : '—'} />
        <StatPill
          label="Roots (y≈0)"
          value={roots.length === 0 ? 'None found' : roots.map(r => `x=${r}`).join('  ')}
        />
        {result?.actualDuration != null && (
          <StatPill label="Duration" value={`${result.actualDuration}s`} />
        )}
      </div>
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
