'use client';

import type { MatchTier } from '@/lib/types';
import { TIER_COLOR } from './TierBadge';

const MIN = 0.1;
const MAX = 0.95;

const MARKS: Array<{ v: number; l: MatchTier }> = [
  { v: 0.10, l: 'noise' },
  { v: 0.40, l: 'weak' },
  { v: 0.65, l: 'probable' },
  { v: 0.80, l: 'strong' },
];

export function thresholdToTier(t: number): MatchTier {
  if (t >= 0.8) return 'strong';
  if (t >= 0.65) return 'probable';
  if (t >= 0.4) return 'weak';
  return 'noise';
}

export function ThresholdSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const p = ((value - MIN) / (MAX - MIN)) * 100;
  const tier = thresholdToTier(value);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="eyebrow">Min. confidence</div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[13px] tabular-nums text-text-primary">{value.toFixed(2)}</span>
          <span className="eyebrow" style={{ color: TIER_COLOR[tier] }}>{tier}</span>
        </div>
      </div>
      <input
        type="range"
        className="range"
        min={MIN}
        max={MAX}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ '--p': `${p}%` } as React.CSSProperties}
      />
      <div className="relative h-3.5 mt-0.5">
        {MARKS.map((m) => (
          <span
            key={m.l}
            className="eyebrow absolute text-[9px]"
            style={{
              left: `${((m.v - MIN) / (MAX - MIN)) * 100}%`,
              color: m.l === tier ? TIER_COLOR[tier] : 'var(--text-disabled)',
              transform: m.v > 0.85 ? 'translateX(-100%)' : m.v < 0.15 ? 'none' : 'translateX(-30%)',
            }}
          >
            {m.l}
          </span>
        ))}
      </div>
    </div>
  );
}
