import { useEffect, useState } from 'react';

const STROKE = {
  evaluating: '#818cf8',   // indigo
  accepted:   '#4ade80',   // green
  rejected:   '#f87171',   // red (unused in current flow, but available)
};

/**
 * Fixed SVG overlay that draws an animated dashed line between two
 * DOM elements identified by their data-card-id attribute.
 *
 * Props:
 *   fromId  — data-card-id of the source element (task card)
 *   toId    — data-card-id of the target element (machine card)
 *   color   — 'evaluating' | 'accepted' | 'rejected'
 *   visible — controls whether the line is shown
 */
export default function ConnectorCanvas({ fromId, toId, color = 'evaluating', visible }) {
  const [coords, setCoords] = useState(null);

  useEffect(() => {
    if (!visible || !fromId || !toId) {
      setCoords(null);
      return;
    }

    // rAF ensures the DOM has been painted before measuring
    const raf = requestAnimationFrame(() => {
      const fromEl = document.querySelector(`[data-card-id="${fromId}"]`);
      const toEl   = document.querySelector(`[data-card-id="${toId}"]`);

      if (!fromEl || !toEl) { setCoords(null); return; }

      const f = fromEl.getBoundingClientRect();
      const t = toEl.getBoundingClientRect();

      setCoords({
        x1: f.right,
        y1: f.top + f.height / 2,
        x2: t.left,
        y2: t.top + t.height / 2,
      });
    });

    return () => cancelAnimationFrame(raf);
  }, [fromId, toId, color, visible]);

  if (!coords) return null;

  const stroke = STROKE[color] ?? STROKE.evaluating;

  // Compute a slight curve via a quadratic bezier midpoint
  const mx = (coords.x1 + coords.x2) / 2;
  const my = Math.min(coords.y1, coords.y2) - 20;
  const d  = `M ${coords.x1} ${coords.y1} Q ${mx} ${my} ${coords.x2} ${coords.y2}`;

  return (
    <svg
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 60, width: '100vw', height: '100vh' }}
      aria-hidden="true"
    >
      {/* Glow layer (thicker, low opacity) */}
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="6"
        opacity="0.18"
        strokeLinecap="round"
      />

      {/* Main animated dash */}
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeDasharray="7 4"
        strokeLinecap="round"
        className="connector-anim"
        opacity="0.9"
      />

      {/* Source dot */}
      <circle cx={coords.x1} cy={coords.y1} r="4" fill={stroke} opacity="0.85" />

      {/* Arrowhead at destination */}
      <circle cx={coords.x2} cy={coords.y2} r="5" fill={stroke} opacity="0.7" />
      <circle cx={coords.x2} cy={coords.y2} r="3" fill={stroke} opacity="1"   />
    </svg>
  );
}
