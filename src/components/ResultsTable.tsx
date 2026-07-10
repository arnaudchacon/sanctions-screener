'use client';

import { useState } from 'react';
import type { Match, ScreenResponse } from '@/lib/types';
import { TierBadge, TierDot, TIER_COLOR } from './TierBadge';
import {
  getDisposition,
  setDisposition,
  clearDisposition,
  type Disposition,
} from '@/lib/adjudication';

const DISPOSITION_LABEL: Record<Disposition, string> = {
  confirmed: 'Confirmed match',
  cleared: 'Cleared — false positive',
  escalated: 'Escalated',
};

const DISPOSITION_COLOR: Record<Disposition, string> = {
  confirmed: 'var(--tier-strong)',
  cleared: 'var(--ok)',
  escalated: 'var(--tier-probable)',
};

export function ResultsTable({
  results,
  onDispositionChange,
}: {
  results: ScreenResponse;
  onDispositionChange?: () => void;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  // Bump to re-read localStorage-backed dispositions after a change.
  const [, setVersion] = useState(0);

  const changed = () => {
    setVersion((v) => v + 1);
    onDispositionChange?.();
  };

  if (results.matches.length === 0) {
    return (
      <div className="panel">
        <div className="px-6 py-14 text-center text-[13px] text-text-secondary">
          No matches above threshold {results.min_score.toFixed(2)}. Lower the minimum
          confidence or remove the program filter.
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-surface">
            {['#', 'Entity / alias', 'Type', 'Program', 'Score', 'Tier', ''].map((h, i) => (
              <th
                key={i}
                className="eyebrow text-left px-4 py-2.5 border-b border-border font-medium"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.matches.map((m, i) => (
            <Row
              key={m.ent_num}
              idx={i}
              match={m}
              query={results.query}
              isOpen={openId === m.ent_num}
              onToggle={() => setOpenId(openId === m.ent_num ? null : m.ent_num)}
              onChanged={changed}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  match,
  idx,
  query,
  isOpen,
  onToggle,
  onChanged,
}: {
  match: Match;
  idx: number;
  query: string;
  isOpen: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const disposition = getDisposition(query, match.ent_num);

  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer hover:bg-surface transition-colors duration-100"
        style={
          match.match_tier === 'strong' && !disposition
            ? { boxShadow: 'inset 3px 0 0 var(--tier-strong)' }
            : undefined
        }
      >
        <td className="px-4 py-3.5 border-b border-border font-mono text-[11px] text-text-disabled w-9">
          {String(idx + 1).padStart(2, '0')}
        </td>
        <td className="px-4 py-3.5 border-b border-border">
          <div className="flex items-center gap-3">
            <TierDot tier={match.match_tier} />
            <div className="min-w-0">
              <div className="font-semibold text-text-primary text-[14px]">{match.sdn_name}</div>
              {match.best_alias_name && match.best_alias_name !== match.sdn_name && (
                <div className="text-[12px] text-text-tertiary mt-0.5">
                  aka <span className="font-mono">{match.best_alias_name}</span>
                </div>
              )}
              {disposition && (
                <div
                  className="text-[11px] font-medium mt-1 inline-flex items-center gap-1"
                  style={{ color: DISPOSITION_COLOR[disposition.disposition] }}
                >
                  ● {DISPOSITION_LABEL[disposition.disposition]}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3.5 border-b border-border text-[12px] text-text-tertiary">
          {match.sdn_type === 'entity' ? 'Entity' : match.sdn_type === 'individual' ? 'Individual' : match.sdn_type ?? '—'}
        </td>
        <td className="px-4 py-3.5 border-b border-border font-mono text-[11px] text-text-secondary">
          {match.program ?? '—'}
        </td>
        <td className="px-4 py-3.5 border-b border-border w-[160px]">
          <div className="flex items-center gap-2">
            <div className="bar flex-1">
              <i
                style={{
                  width: `${Math.max(2, match.weighted_score * 100)}%`,
                  background: TIER_COLOR[match.match_tier],
                }}
              />
            </div>
            <span className="font-mono text-[11px] tabular-nums text-text-primary min-w-[38px] text-right">
              {match.weighted_score.toFixed(3)}
            </span>
          </div>
        </td>
        <td className="px-4 py-3.5 border-b border-border w-[110px]">
          <TierBadge tier={match.match_tier} />
        </td>
        <td className="px-4 py-3.5 border-b border-border w-8 text-right text-text-disabled">
          <svg
            width="11" height="11" viewBox="0 0 10 10"
            style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform 120ms' }}
          >
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" fill="none" strokeWidth="1.4" />
          </svg>
        </td>
      </tr>

      {isOpen && (
        <tr>
          <td colSpan={7} className="bg-surface border-b border-border p-0">
            <div className="px-5 py-5 grid md:grid-cols-[1fr_1.2fr] gap-8">
              {/* Identity + adjudication */}
              <div>
                <div className="eyebrow mb-2.5">Identity</div>
                <DefLine label="SDN #" value={`#${match.ent_num}`} mono />
                <DefLine label="Type" value={match.sdn_type ?? '—'} />
                <DefLine label="Program" value={match.program ?? '—'} mono />
                {match.best_alias_name && match.best_alias_name !== match.sdn_name && (
                  <DefLine label="Best alias" value={match.best_alias_name} mono />
                )}

                <div className="eyebrow mb-2 mt-5">Disposition</div>
                <div className="flex flex-wrap gap-2 no-print">
                  <DispositionButton
                    label="Confirm match"
                    color="var(--tier-strong)"
                    active={disposition?.disposition === 'confirmed'}
                    onClick={() => {
                      if (disposition?.disposition === 'confirmed') clearDisposition(query, match.ent_num);
                      else setDisposition({ query, ent_num: match.ent_num, sdn_name: match.sdn_name, program: match.program, weighted_score: match.weighted_score, match_tier: match.match_tier, disposition: 'confirmed' });
                      onChanged();
                    }}
                  />
                  <DispositionButton
                    label="Escalate"
                    color="var(--tier-probable)"
                    active={disposition?.disposition === 'escalated'}
                    onClick={() => {
                      if (disposition?.disposition === 'escalated') clearDisposition(query, match.ent_num);
                      else setDisposition({ query, ent_num: match.ent_num, sdn_name: match.sdn_name, program: match.program, weighted_score: match.weighted_score, match_tier: match.match_tier, disposition: 'escalated' });
                      onChanged();
                    }}
                  />
                  <DispositionButton
                    label="Clear — false positive"
                    color="var(--ok)"
                    active={disposition?.disposition === 'cleared'}
                    onClick={() => {
                      if (disposition?.disposition === 'cleared') clearDisposition(query, match.ent_num);
                      else setDisposition({ query, ent_num: match.ent_num, sdn_name: match.sdn_name, program: match.program, weighted_score: match.weighted_score, match_tier: match.match_tier, disposition: 'cleared' });
                      onChanged();
                    }}
                  />
                </div>
                {disposition && (
                  <p className="text-[11px] text-text-tertiary mt-2">
                    Recorded {new Date(disposition.decided_at).toLocaleString()} — stored in this
                    browser, included in the audit log export.
                  </p>
                )}
              </div>

              {/* Score decomposition */}
              <div>
                <div className="eyebrow mb-2.5">Score decomposition</div>
                <ScoreLine label="Primary name" weight={0.4} value={match.primary_name_score} />
                <ScoreLine label="Best known name" weight={0.4} value={match.best_alias_score} />
                <ScoreLine label="Phonetic" weight={0.2} value={match.phonetic_score} />
                <div className="border-t border-border-strong pt-2 mt-2 flex items-center justify-between">
                  <span className="font-mono text-[11px] text-text-primary">Weighted</span>
                  <span
                    className="font-mono text-[14px] font-semibold tabular-nums"
                    style={{ color: TIER_COLOR[match.match_tier] }}
                  >
                    {match.weighted_score.toFixed(3)}
                  </span>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function DispositionButton({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors duration-100"
      style={{
        borderColor: color,
        color: active ? 'var(--surface-elevated)' : color,
        background: active ? color : 'transparent',
      }}
    >
      {label}
    </button>
  );
}

function DefLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 py-[3px] text-[12px]">
      <span className="eyebrow text-[10px]">{label}</span>
      <span className={`text-text-primary ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function ScoreLine({ label, weight, value }: { label: string; weight: number; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-[3px] text-[12px]">
      <div className="min-w-[130px]">
        <span className="font-mono text-[11px] text-text-secondary">{label}</span>
        <span className="font-mono text-[9px] text-text-disabled ml-1.5">×{weight.toFixed(2)}</span>
      </div>
      <div className="flex-1 max-w-[140px]">
        <div className="bar"><i style={{ width: `${value * 100}%` }} /></div>
      </div>
      <span className="font-mono text-[11px] tabular-nums text-text-primary min-w-[38px] text-right">
        {value.toFixed(3)}
      </span>
    </div>
  );
}
