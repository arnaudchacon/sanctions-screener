'use client';

import type { Program } from '@/lib/types';
import type { MatchTier } from '@/lib/types';
import { TIER_COLOR } from './TierBadge';
import { listDispositions } from '@/lib/adjudication';
import { downloadCsv } from '@/lib/csv';

export type HistoryItem = { q: string; n: number; tier: MatchTier; at: number };

export function RecentScreenings({
  history,
  onPick,
  current,
}: {
  history: HistoryItem[];
  onPick: (h: HistoryItem) => void;
  current: string;
}) {
  if (!history.length) return null;
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="eyebrow" style={{ color: 'var(--text-primary)' }}>Recent screenings</span>
        <span className="eyebrow">{history.length}</span>
      </div>
      <ul className="list-none m-0 p-0">
        {history.map((h, i) => (
          <li
            key={i}
            onClick={() => onPick(h)}
            className={`px-4 py-2.5 cursor-pointer flex items-center gap-2.5 hover:bg-surface transition-colors duration-100 ${
              i < history.length - 1 ? 'border-b border-border' : ''
            } ${h.q === current ? 'bg-surface' : ''}`}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: TIER_COLOR[h.tier] }}
            />
            <span className="flex-1 text-[13px] text-text-primary truncate">{h.q}</span>
            <span className="font-mono text-[10px] text-text-tertiary tabular-nums">{h.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProgramsList({
  programs,
  active,
  onPick,
  limit = 10,
}: {
  programs: Program[];
  active: string;
  onPick: (code: string) => void;
  limit?: number;
}) {
  const shown = programs.slice(0, limit);
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="eyebrow" style={{ color: 'var(--text-primary)' }}>Programs</span>
        <span className="eyebrow">
          {programs.length > 0 ? `${shown.length} / ${programs.length}` : '—'}
        </span>
      </div>
      {programs.length === 0 ? (
        <div className="px-4 py-3 text-[12px] text-text-tertiary">Loading…</div>
      ) : (
        <ul className="list-none m-0 p-0">
          {shown.map((p, i) => {
            const isActive = active === p.code;
            return (
              <li
                key={p.code}
                onClick={() => onPick(p.code)}
                className={`px-4 py-2.5 cursor-pointer flex items-center gap-2.5 transition-colors duration-100 ${
                  i < shown.length - 1 ? 'border-b border-border' : ''
                } ${isActive ? 'bg-accent-bg' : 'hover:bg-surface'}`}
                style={isActive ? { boxShadow: 'inset 2px 0 0 var(--accent)' } : undefined}
              >
                <span
                  className={`font-mono text-[11px] flex-1 ${isActive ? 'font-semibold' : 'font-medium'}`}
                  style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}
                >
                  {p.code}
                </span>
                <span className="font-mono text-[10px] text-text-tertiary tabular-nums">
                  {p.count.toLocaleString()}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function AuditLog({ version }: { version: number }) {
  // `version` forces re-render when a disposition changes elsewhere.
  void version;
  const records = typeof window !== 'undefined' ? listDispositions() : [];

  function exportAuditLog() {
    downloadCsv(
      `sentinel-audit-log-${new Date().toISOString().split('T')[0]}.csv`,
      ['decided_at', 'query', 'sdn_entity', 'sdn_number', 'program', 'weighted_score', 'tier', 'disposition'],
      records.map((r) => [
        r.decided_at,
        r.query,
        r.sdn_name,
        r.ent_num,
        r.program,
        r.weighted_score.toFixed(4),
        r.match_tier,
        r.disposition,
      ])
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="eyebrow" style={{ color: 'var(--text-primary)' }}>Audit log</span>
        <span className="eyebrow">{records.length}</span>
      </div>
      <div className="px-4 py-3">
        <p className="text-[12px] text-text-secondary mb-3">
          {records.length === 0
            ? 'Dispositions you record on hits appear here — confirm, clear, or escalate from any result row.'
            : `${records.length} disposition${records.length !== 1 ? 's' : ''} recorded in this browser.`}
        </p>
        <button
          onClick={exportAuditLog}
          disabled={records.length === 0}
          className="w-full px-3 py-2 rounded-md text-[12px] font-medium border border-border-strong text-text-primary hover:bg-surface transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Export audit log · CSV
        </button>
      </div>
    </div>
  );
}
