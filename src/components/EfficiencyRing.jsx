import { useEffect, useRef } from 'react';
import { getEfficiencyColor } from '../utils/computeStats';

/**
 * EfficiencyRing
 * SVG donut ring that animates from empty to the given score (0–100).
 * The ring colour transitions green > yellow > red based on the score.
 *
 * Props:
 *   score {number}  0–100
 *   size  {number}  SVG viewport size in px (default 110)
 */

const RADIUS = 38;
const CIRC   = 2 * Math.PI * RADIUS; // ≈ 238.76 px

export default function EfficiencyRing({ score, size = 110 }) {
  const progressRef = useRef(null);
  const colors      = getEfficiencyColor(score);
  const target      = CIRC * (1 - Math.min(100, Math.max(0, score)) / 100);
  const center      = size / 2;

  useEffect(() => {
    const el = progressRef.current;
    if (!el) return;

    // 1. Snap to empty (no transition) so the animation always plays from zero
    el.style.transition       = 'none';
    el.style.strokeDashoffset = String(CIRC);

    // 2. Force a reflow so the browser registers the initial state
    void el.getBoundingClientRect();

    // 3. Animate to the target offset
    el.style.transition       = 'stroke-dashoffset 1.4s cubic-bezier(0.4, 0, 0.2, 1)';
    el.style.strokeDashoffset = String(target);
  }, [score, target]);

  return (
    <div
      className="relative flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      {/* SVG rotated so arc starts at 12 o'clock */}
      <svg
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden="true"
      >
        {/* Background track */}
        <circle
          cx={center} cy={center} r={RADIUS}
          fill="none"
          stroke="rgba(100,116,139,0.25)"
          strokeWidth="9"
        />
        {/* Animated progress arc */}
        <circle
          ref={progressRef}
          cx={center} cy={center} r={RADIUS}
          fill="none"
          stroke={colors.stroke}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC}   /* overridden by useEffect */
          style={{
            filter: `drop-shadow(0 0 5px ${colors.stroke}80)`,
          }}
        />
      </svg>

      {/* Score label centred inside the ring */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold font-mono leading-none ${colors.text}`}>
          {score}
        </span>
        <span className="text-[9px] text-slate-600 mt-0.5 uppercase tracking-wider">/ 100</span>
      </div>
    </div>
  );
}
