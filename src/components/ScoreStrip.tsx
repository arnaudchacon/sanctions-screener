'use client';

// Score distribution strip: every candidate plotted on the 0–1 confidence
// axis, tier boundaries marked, and the live threshold cutting through the
// field. Clicking anywhere on the strip moves the threshold — the slider and
// the strip are two views of the same control.

import { useMemo, useRef } from 'react';
import type { Match } from '@/lib/types';
import { TIER_COLOR } from './TierBadge';

const X_MIN = 0.1;
const X_MAX = 1.0;
const H = 84;
const PAD_X = 8;
const BASE_Y = H - 22;
const DOT_R = 4;
const STACK_STEP = 9.5;
const MAX_STACK = 5;

const BOUNDARIES = [
  { v: 0.40, label: 'weak' },
  { v: 0.65, label: 'probable' },
  { v: 0.80, label: 'strong' },
];

export function ScoreStrip({
  matches,
  threshold,
  onThresholdChange,
}: {
  matches: Match[];
  threshold: number;
  onThresholdChange: (v: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const W = 800; // viewBox width; SVG scales to container

  const xOf = (score: number) =>
    PAD_X + ((Math.min(Math.max(score, X_MIN), X_MAX) - X_MIN) / (X_MAX - X_MIN)) * (W - PAD_X * 2);

  // Stack dots that share an x-bin so overlapping scores read as a column.
  const dots = useMemo(() => {
    const binW = (X_MAX - X_MIN) / 64;
    const bins = new Map<number, number>();
    return [...matches]
      .sort((a, b) => a.weighted_score - b.weighted_score)
      .map((m) => {
        const bin = Math.round((m.weighted_score - X_MIN) / binW);
        const level = bins.get(bin) ?? 0;
        bins.set(bin, level + 1);
        return {
          match: m,
          x: xOf(m.weighted_score),
          y: BASE_Y - Math.min(level, MAX_STACK) * STACK_STEP - (level > MAX_STACK ? (level - MAX_STACK) * 1.5 : 0),
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const score = X_MIN + frac * (X_MAX - X_MIN);
    onThresholdChange(Math.min(0.95, Math.max(X_MIN, Math.round(score * 100) / 100)));
  }

  const above = matches.filter((m) => m.weighted_score >= threshold).length;
  const thresholdX = xOf(threshold);

  return (
    <div className="panel px-4 pt-3 pb-1 no-print">
      <div className="flex items-baseline justify-between mb-1">
        <span className="eyebrow">Score distribution — {matches.length} candidates</span>
        <span className="font-mono text-[11px] tabular-nums text-text-secondary">
          {above} above threshold · {matches.length - above} below
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full cursor-crosshair select-none"
        style={{ height: H }}
        onClick={handleClick}
        role="img"
        aria-label={`Score distribution of ${matches.length} candidates; threshold at ${threshold.toFixed(2)}`}
      >
        {/* baseline */}
        <line x1={PAD_X} x2={W - PAD_X} y1={BASE_Y + DOT_R + 3} y2={BASE_Y + DOT_R + 3} stroke="var(--border)" strokeWidth="1" />

        {/* tier boundaries — recessive */}
        {BOUNDARIES.map((b) => (
          <g key={b.v}>
            <line x1={xOf(b.v)} x2={xOf(b.v)} y1={10} y2={BASE_Y + DOT_R + 3} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 3" />
            <text x={xOf(b.v) + 4} y={H - 6} fontSize="9" fill="var(--text-disabled)" fontFamily="var(--font-jetbrains), monospace" letterSpacing="0.06em">
              {b.v.toFixed(2)} {b.label}
            </text>
          </g>
        ))}

        {/* axis end labels */}
        <text x={PAD_X} y={H - 6} fontSize="9" fill="var(--text-disabled)" fontFamily="var(--font-jetbrains), monospace">{X_MIN.toFixed(2)}</text>
        <text x={W - PAD_X} y={H - 6} fontSize="9" fill="var(--text-disabled)" fontFamily="var(--font-jetbrains), monospace" textAnchor="end">1.00</text>

        {/* dots — 2px surface ring separates overlaps; below-threshold dots hollow */}
        {dots.map(({ match, x, y }) => {
          const included = match.weighted_score >= threshold;
          const color = TIER_COLOR[match.match_tier];
          return (
            <circle
              key={match.ent_num}
              cx={x}
              cy={y}
              r={DOT_R}
              fill={included ? color : 'var(--surface-elevated)'}
              stroke={included ? 'var(--surface-elevated)' : color}
              strokeWidth={included ? 2 : 1.2}
              opacity={included ? 1 : 0.45}
            >
              <title>{`${match.sdn_name} — ${match.weighted_score.toFixed(3)} (${match.match_tier})`}</title>
            </circle>
          );
        })}

        {/* threshold line */}
        <g style={{ transition: 'transform 120ms ease-out' }} transform={`translate(${thresholdX} 0)`}>
          <line x1={0} x2={0} y1={6} y2={BASE_Y + DOT_R + 3} stroke="var(--accent)" strokeWidth="1.5" />
          <path d={`M -4 6 L 4 6 L 0 12 Z`} fill="var(--accent)" />
        </g>
      </svg>
    </div>
  );
}
