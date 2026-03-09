import EfficiencyRing    from './EfficiencyRing';
import { getEfficiencyColor } from '../utils/computeStats';

/**
 * StatCards
 * Four-card summary strip for the Output Dashboard.
 * Cards use a Grafana/Datadog monitoring aesthetic with coloured borders.
 *
 * Props:
 *   stats {object}  Output of computeStats()
 */
export default function StatCards({ stats }) {
  const { totalWallClockS, avgDuration, peakMachine, efficiencyScore } = stats;
  const effColors = getEfficiencyColor(efficiencyScore);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

      {/* ── Total Execution Time ── */}
      <MetricCard
        icon="⏱️"
        label="Total Execution Time"
        value={`${totalWallClockS}s`}
        sub="wall-clock duration"
        border="border-blue-700/30"
        bg="bg-blue-950/20"
        valueColor="text-blue-300"
      />

      {/* ── Average Task Duration ── */}
      <MetricCard
        icon="📊"
        label="Avg Task Duration"
        value={`${avgDuration}s`}
        sub="per task"
        border="border-purple-700/30"
        bg="bg-purple-950/20"
        valueColor="text-purple-300"
      />

      {/* ── Peak Machine Utilization ── */}
      <MetricCard
        icon="🖥️"
        label="Peak Utilization"
        value={peakMachine.name}
        sub={`${peakMachine.count} task${peakMachine.count !== 1 ? 's' : ''} executed`}
        border="border-orange-700/30"
        bg="bg-orange-950/20"
        valueColor="text-orange-300"
        valueSize="text-lg"
      />

      {/* ── Scheduling Efficiency Score (ring) ── */}
      <div
        className={`
          rounded-xl border p-4 flex items-center gap-4
          ${effColors.border} ${effColors.bg}
        `}
      >
        <EfficiencyRing score={efficiencyScore} size={100} />
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">
            Efficiency Score
          </p>
          <p className={`text-base font-bold ${effColors.text}`}>
            {effColors.label}
          </p>
          <p className="text-[10px] text-slate-600 mt-0.5 leading-snug">
            scheduling<br />efficiency
          </p>
        </div>
      </div>

    </div>
  );
}

// ── MetricCard ────────────────────────────────────────────────────────────────

function MetricCard({
  icon, label, value, sub,
  border, bg, valueColor,
  valueSize = 'text-2xl',
}) {
  return (
    <div className={`rounded-xl border ${border} ${bg} p-4 flex flex-col gap-2`}>
      {/* Label row */}
      <div className="flex items-center gap-2">
        <span className="text-sm leading-none">{icon}</span>
        <p className="text-[9px] uppercase tracking-widest text-slate-500 leading-none">
          {label}
        </p>
      </div>
      {/* Big value */}
      <p className={`font-bold font-mono ${valueColor} ${valueSize} leading-none mt-1`}>
        {value}
      </p>
      {/* Sub-label */}
      <p className="text-[10px] text-slate-600">{sub}</p>
    </div>
  );
}
