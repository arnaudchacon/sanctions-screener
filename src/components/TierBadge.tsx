import type { MatchTier } from '@/lib/types';

export const TIER_COLOR: Record<MatchTier, string> = {
  strong:   'var(--tier-strong)',
  probable: 'var(--tier-probable)',
  weak:     'var(--tier-weak)',
  noise:    'var(--tier-noise)',
};

export const TIER_BG: Record<MatchTier, string> = {
  strong:   'var(--tier-strong-bg)',
  probable: 'var(--tier-probable-bg)',
  weak:     'var(--tier-weak-bg)',
  noise:    'var(--tier-noise-bg)',
};

export function TierBadge({ tier }: { tier: MatchTier }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-[0.05em]"
      style={{ color: TIER_COLOR[tier], background: TIER_BG[tier] }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
      {tier}
    </span>
  );
}

export function TierDot({ tier }: { tier: MatchTier }) {
  return (
    <span
      className="inline-block w-[7px] h-[7px] rounded-full shrink-0"
      style={{ background: TIER_COLOR[tier] }}
    />
  );
}
