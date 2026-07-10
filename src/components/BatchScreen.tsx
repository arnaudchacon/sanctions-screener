'use client';

import { useRef, useState } from 'react';
import type { BatchResponse, MatchTier } from '@/lib/types';
import { TierBadge, TierDot, TIER_COLOR } from './TierBadge';
import { downloadCsv } from '@/lib/csv';

const MAX_NAMES = 100;

// Take the first cell of each CSV line, handling simple quoting. Skips a
// header row when the first line looks like one.
function namesFromCsv(text: string): string[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const firstCell = (line: string): string => {
    const t = line.trim();
    if (t.startsWith('"')) {
      const end = t.indexOf('"', 1);
      return end > 0 ? t.slice(1, end).replace(/""/g, '"') : t.slice(1);
    }
    const comma = t.indexOf(',');
    return comma === -1 ? t : t.slice(0, comma);
  };
  const cells = lines.map(firstCell).map((c) => c.trim()).filter(Boolean);
  if (cells.length > 1 && /^(name|full[_ ]?name|counterparty|entity)$/i.test(cells[0])) {
    return cells.slice(1);
  }
  return cells;
}

export function BatchScreen({
  minScore,
  program,
}: {
  minScore: number;
  program: string;
}) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BatchResponse | null>(null);
  const [openName, setOpenName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const names = text.split(/\r?\n/).map((n) => n.trim()).filter(Boolean);

  async function handleFile(file: File) {
    const content = await file.text();
    const parsed = namesFromCsv(content);
    setText(parsed.slice(0, MAX_NAMES).join('\n'));
    setFileName(file.name);
  }

  async function run() {
    if (names.length === 0) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setOpenName(null);
    try {
      const res = await fetch('/api/screen-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          names: names.slice(0, MAX_NAMES),
          min_score: minScore,
          program: program.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Batch screening failed');
      }
      setResults(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  function exportBatch() {
    if (!results) return;
    const rows: Array<Array<string | number | null>> = [];
    for (const row of results.rows) {
      if (row.matches.length === 0) {
        rows.push([row.name, '', '', '', '', '', 'clear — no matches']);
        continue;
      }
      row.matches.forEach((m, i) => {
        rows.push([row.name, i + 1, m.sdn_name, m.ent_num, m.program, m.weighted_score.toFixed(4), m.match_tier]);
      });
    }
    downloadCsv(
      `sentinel-batch-${new Date().toISOString().split('T')[0]}.csv`,
      ['input_name', 'rank', 'sdn_entity', 'sdn_number', 'program', 'weighted_score', 'tier'],
      rows
    );
  }

  const summary = results
    ? {
        flagged: results.rows.filter((r) => r.top_tier === 'strong').length,
        review: results.rows.filter((r) => r.top_tier === 'probable').length,
        weak: results.rows.filter((r) => r.top_tier === 'weak' || r.top_tier === 'noise').length,
        clear: results.rows.filter((r) => r.match_count === 0).length,
      }
    : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Input */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <div className="eyebrow">Names to screen — one per line</div>
          <span className={`font-mono text-[11px] tabular-nums ${names.length > MAX_NAMES ? 'text-tier-strong' : 'text-text-tertiary'}`}>
            {names.length} / {MAX_NAMES}
          </span>
        </div>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setFileName(null); }}
          placeholder={'Vladimir Putin\nAerocaribbean Airlines\nMaria Gonzalez\n…'}
          rows={6}
          className="w-full rounded-lg border border-border-strong bg-surface-elevated px-3.5 py-3 text-[13px] font-mono text-text-primary outline-none focus:border-ink resize-y"
        />
        <div className="flex items-center justify-between mt-2.5 flex-wrap gap-3">
          <div className="flex items-center gap-3 text-[12px] text-text-tertiary">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="text-accent hover:text-accent-hover font-medium transition-colors duration-100"
            >
              Upload CSV
            </button>
            {fileName && <span className="font-mono text-[11px]">{fileName}</span>}
            <span>· first column is used · {MAX_NAMES} names max per run</span>
          </div>
          <button
            onClick={run}
            disabled={loading || names.length === 0}
            className="bg-ink text-bg px-5 py-2 rounded-md text-[13px] font-medium hover:bg-ink-hover transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? `Screening ${Math.min(names.length, MAX_NAMES)} names…` : 'Screen batch'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border px-4 py-3 text-[13px]" style={{ borderColor: 'var(--tier-strong)', background: 'var(--tier-strong-bg)', color: 'var(--tier-strong)' }}>
          {error}
        </div>
      )}

      {/* Results */}
      {results && summary && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4 text-[12px] text-text-secondary">
              <span className="font-mono font-semibold text-text-primary">{results.screened} screened</span>
              <Chip color="var(--tier-strong)" label={`${summary.flagged} flagged`} />
              <Chip color="var(--tier-probable)" label={`${summary.review} to review`} />
              <Chip color="var(--tier-weak)" label={`${summary.weak} weak only`} />
              <Chip color="var(--ok)" label={`${summary.clear} clear`} />
            </div>
            <button
              onClick={exportBatch}
              className="px-3 py-1.5 rounded-md text-[12px] font-medium border border-border-strong text-text-primary hover:bg-surface transition-colors duration-100"
            >
              Export batch · CSV
            </button>
          </div>

          <div className="panel">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-surface">
                  {['Input name', 'Top match', 'Score', 'Tier', 'Matches', ''].map((h, i) => (
                    <th key={i} className="eyebrow text-left px-4 py-2.5 border-b border-border font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.rows.map((row) => {
                  const top = row.matches[0] ?? null;
                  const isOpen = openName === row.name;
                  return (
                    <BatchRow
                      key={row.name}
                      row={row}
                      top={top}
                      isOpen={isOpen}
                      onToggle={() => setOpenName(isOpen ? null : row.name)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Chip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function BatchRow({
  row,
  top,
  isOpen,
  onToggle,
}: {
  row: BatchResponse['rows'][number];
  top: BatchResponse['rows'][number]['matches'][number] | null;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const expandable = row.matches.length > 0;
  return (
    <>
      <tr
        onClick={expandable ? onToggle : undefined}
        className={`${expandable ? 'cursor-pointer hover:bg-surface' : ''} transition-colors duration-100`}
        style={
          row.top_tier === 'strong'
            ? { boxShadow: 'inset 3px 0 0 var(--tier-strong)' }
            : undefined
        }
      >
        <td className="px-4 py-3 border-b border-border font-medium text-text-primary">{row.name}</td>
        <td className="px-4 py-3 border-b border-border">
          {top ? (
            <span className="flex items-center gap-2.5">
              <TierDot tier={top.match_tier as MatchTier} />
              <span className="text-text-primary">{top.sdn_name}</span>
            </span>
          ) : (
            <span className="text-text-tertiary">No matches above threshold</span>
          )}
        </td>
        <td className="px-4 py-3 border-b border-border w-[90px] font-mono text-[11px] tabular-nums text-text-primary">
          {top ? top.weighted_score.toFixed(3) : '—'}
        </td>
        <td className="px-4 py-3 border-b border-border w-[110px]">
          {row.top_tier ? (
            <TierBadge tier={row.top_tier as MatchTier} />
          ) : (
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-[0.05em]"
              style={{ color: 'var(--ok)', background: 'var(--ok-bg)' }}
            >
              clear
            </span>
          )}
        </td>
        <td className="px-4 py-3 border-b border-border w-[80px] font-mono text-[11px] tabular-nums text-text-tertiary">
          {row.match_count}
        </td>
        <td className="px-4 py-3 border-b border-border w-8 text-right text-text-disabled">
          {expandable && (
            <svg width="11" height="11" viewBox="0 0 10 10" style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform 120ms' }}>
              <path d="M2 3.5l3 3 3-3" stroke="currentColor" fill="none" strokeWidth="1.4" />
            </svg>
          )}
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={6} className="bg-surface border-b border-border px-5 py-4">
            <div className="eyebrow mb-2.5">Top candidates for &ldquo;{row.name}&rdquo;</div>
            <div className="flex flex-col gap-1.5">
              {row.matches.map((m, i) => (
                <div key={m.ent_num} className="flex items-center gap-3 text-[12px]">
                  <span className="font-mono text-[10px] text-text-disabled w-5">{String(i + 1).padStart(2, '0')}</span>
                  <TierDot tier={m.match_tier as MatchTier} />
                  <span className="flex-1 text-text-primary truncate">{m.sdn_name}</span>
                  <span className="font-mono text-[10px] text-text-tertiary">{m.program ?? '—'}</span>
                  <span
                    className="font-mono text-[11px] tabular-nums min-w-[38px] text-right"
                    style={{ color: TIER_COLOR[m.match_tier as MatchTier] }}
                  >
                    {m.weighted_score.toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
