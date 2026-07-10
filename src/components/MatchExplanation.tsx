// Why did this match? Each query token aligned to its best counterpart in
// the entity name with per-pair similarity — the client-side mirror of the
// SQL token-set scoring.

import { explainMatch } from '@/lib/explain';

export function MatchExplanation({ query, name }: { query: string; name: string }) {
  const { alignments, unmatchedNameTokens } = explainMatch(query, name);
  if (alignments.length === 0) return null;

  return (
    <div>
      <div className="eyebrow mb-2.5">Why this matched</div>
      <div className="flex flex-col gap-1.5">
        {alignments.map((a, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px]">
            <span className="font-mono text-text-primary min-w-[92px] truncate" title={a.queryToken}>
              {a.queryToken}
            </span>
            <span className="text-text-disabled">→</span>
            {a.nameToken ? (
              <>
                <span className="font-mono text-text-secondary min-w-[92px] truncate" title={a.nameToken}>
                  {a.nameToken}
                </span>
                <span className="bar flex-1 max-w-[90px]">
                  <i
                    style={{
                      width: `${a.similarity * 100}%`,
                      background: a.similarity >= 0.85 ? 'var(--tier-strong)' : a.similarity >= 0.6 ? 'var(--tier-probable)' : 'var(--border-strong)',
                    }}
                  />
                </span>
                <span className="font-mono text-[11px] tabular-nums text-text-tertiary min-w-[34px] text-right">
                  {Math.round(a.similarity * 100)}%
                </span>
              </>
            ) : (
              <span className="text-[11px] text-text-disabled italic">no counterpart in name</span>
            )}
          </div>
        ))}
      </div>
      {unmatchedNameTokens.length > 0 && (
        <p className="text-[11px] text-text-tertiary mt-2">
          Unmatched name tokens:{' '}
          <span className="font-mono">{unmatchedNameTokens.join(' · ')}</span>
          {' '}— extra tokens don&apos;t penalize the token-set score.
        </p>
      )}
    </div>
  );
}
