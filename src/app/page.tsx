// src/app/page.tsx
// Sentinel — screening console. Reads /api/stats, /api/programs, /api/screen.

'use client';

import { useEffect, useState } from 'react';
import type { ScreenResponse, Stats, Program } from '@/lib/types';
import { ThresholdSlider } from '@/components/ThresholdSlider';
import { ResultsTable } from '@/components/ResultsTable';
import { ScoringMethodology } from '@/components/ScoringMethodology';
import { BatchScreen } from '@/components/BatchScreen';
import { RecentScreenings, ProgramsList, AuditLog, type HistoryItem } from '@/components/Sidebar';
import { TIER_COLOR } from '@/components/TierBadge';
import { downloadCsv } from '@/lib/csv';

const EXAMPLE_QUERIES = ['Vladimir Putin', 'Aerocaribbean Airlines', 'Mohammed', 'Banco Nacional'];
const HISTORY_KEY = 'sentinel.history.v1';

type Mode = 'single' | 'batch';

export default function HomePage() {
  const [mode, setMode] = useState<Mode>('single');
  const [query, setQuery] = useState('');
  const [threshold, setThreshold] = useState(0.5);
  const [program, setProgram] = useState('');
  const [results, setResults] = useState<ScreenResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [auditVersion, setAuditVersion] = useState(0);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((data: Stats) => setStats(data))
      .catch(() => setStats(null));

    fetch('/api/programs')
      .then((r) => r.json())
      .then((data: { programs: Program[] }) => setPrograms(data.programs ?? []))
      .catch(() => setPrograms([]));

    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);

  async function handleSearch(overrideQuery?: string) {
    const q = (overrideQuery ?? query).trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          min_score: threshold,
          max_results: 25,
          program: program.trim() || null,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Search failed');
      }
      const data: ScreenResponse = await response.json();
      setResults(data);
      const entry: HistoryItem = {
        q,
        n: data.match_count,
        tier: data.matches[0]?.match_tier ?? 'noise',
        at: Date.now(),
      };
      const next = [entry, ...history.filter((h) => h.q !== q)].slice(0, 8);
      setHistory(next);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  const tierCounts = results
    ? {
        strong: results.matches.filter((m) => m.match_tier === 'strong').length,
        probable: results.matches.filter((m) => m.match_tier === 'probable').length,
        weak: results.matches.filter((m) => m.match_tier === 'weak').length,
      }
    : null;

  function exportSingleCsv() {
    if (!results) return;
    downloadCsv(
      `sentinel-${results.query.replace(/[^a-z0-9]/gi, '-').slice(0, 40)}-${new Date().toISOString().split('T')[0]}.csv`,
      ['rank', 'sdn_entity', 'best_alias', 'type', 'program', 'primary_score', 'alias_score', 'phonetic_score', 'weighted_score', 'tier', 'sdn_number'],
      results.matches.map((m, i) => [
        i + 1, m.sdn_name, m.best_alias_name, m.sdn_type, m.program,
        m.primary_name_score.toFixed(4), m.best_alias_score.toFixed(4),
        m.phonetic_score.toFixed(4), m.weighted_score.toFixed(4),
        m.match_tier, m.ent_num,
      ])
    );
  }

  return (
    <main className="min-h-screen bg-bg">
      <div className="max-w-[1100px] mx-auto px-6 py-10">

        {/* Title */}
        <div className="mb-8">
          <p className="eyebrow mb-2 no-print" style={{ color: 'var(--accent)' }}>
            OFAC SDN · fuzzy name screening
          </p>
          <h1 className="font-serif text-[36px] leading-tight tracking-[-0.01em] text-text-primary mb-2">
            Screening console
          </h1>
          <p className="text-[14px] text-text-secondary max-w-[620px] leading-relaxed no-print">
            Screen counterparty names against the U.S. Treasury SDN list. Token-set Levenshtein
            handles reversed word order and middle names; tokenized Soundex catches
            transliteration variants; every hit takes an auditable disposition.
          </p>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 rounded-xl border border-border bg-surface-elevated overflow-hidden mb-8 no-print">
          <Stat label="Source" value="OFAC SDN" sub="U.S. Treasury" />
          <Stat label="Entities indexed" value={stats ? stats.entity_count.toLocaleString() : '—'} sub="public domain" />
          <Stat label="Last refresh" value={stats?.last_refreshed ? formatDate(stats.last_refreshed) : '—'} sub="ingestion log" />
          <Stat label="Programs" value={programs.length > 0 ? String(programs.length) : '—'} sub="distinct codes" last />
        </div>

        <div className="grid lg:grid-cols-[260px_1fr] gap-6 items-start">

          {/* Sidebar */}
          <aside className="flex flex-col gap-4 no-print">
            <RecentScreenings
              history={history}
              current={query}
              onPick={(h) => { setMode('single'); setQuery(h.q); handleSearch(h.q); }}
            />
            <ProgramsList
              programs={programs}
              active={program}
              onPick={(code) => setProgram(program === code ? '' : code)}
            />
            <AuditLog version={auditVersion} />
          </aside>

          {/* Main column */}
          <section className="flex flex-col gap-5 min-w-0">

            {/* Command panel */}
            <div className="panel no-print">
              {/* Mode tabs */}
              <div className="flex border-b border-border bg-surface">
                {(['single', 'batch'] as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-5 py-3 text-[13px] font-medium border-b-2 -mb-px transition-colors duration-100 ${
                      mode === m
                        ? 'border-accent text-text-primary bg-surface-elevated'
                        : 'border-transparent text-text-tertiary hover:text-text-secondary'
                    }`}
                  >
                    {m === 'single' ? 'Single name' : 'Batch screening'}
                  </button>
                ))}
              </div>

              <div className="p-5">
                {mode === 'single' ? (
                  <>
                    <div className="grid grid-cols-[1fr_auto] gap-3">
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="Counterparty name or entity"
                        className="h-12 rounded-lg border border-border-strong bg-surface-elevated px-4 text-[15px] font-medium text-text-primary outline-none focus:border-ink"
                      />
                      <button
                        onClick={() => handleSearch()}
                        disabled={loading || !query.trim()}
                        className="h-12 bg-ink text-bg px-6 rounded-lg text-[14px] font-medium hover:bg-ink-hover transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? 'Screening…' : 'Screen'}
                      </button>
                    </div>

                    <div className="mt-2.5 text-[12px] text-text-tertiary">
                      Try:{' '}
                      {EXAMPLE_QUERIES.map((ex, i) => (
                        <span key={ex}>
                          <button
                            onClick={() => { setQuery(ex); handleSearch(ex); }}
                            className="text-text-secondary underline decoration-border-strong underline-offset-2 hover:text-accent transition-colors duration-100"
                          >
                            {ex}
                          </button>
                          {i < EXAMPLE_QUERIES.length - 1 && ', '}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <BatchScreen minScore={threshold} program={program} />
                )}

                {/* Shared controls */}
                <div className="grid sm:grid-cols-[1.4fr_1fr] gap-7 mt-5 pt-5 border-t border-border">
                  <ThresholdSlider value={threshold} onChange={setThreshold} />
                  <div>
                    <div className="eyebrow mb-2">Program filter</div>
                    <input
                      value={program}
                      onChange={(e) => setProgram(e.target.value)}
                      placeholder="e.g. SDGT, RUSSIA-EO14024"
                      className="w-full h-9 rounded-md border border-border-strong bg-surface-elevated px-3 font-mono text-[12px] text-text-primary outline-none focus:border-ink"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                className="rounded-lg border px-4 py-3 text-[13px]"
                style={{ borderColor: 'var(--tier-strong)', background: 'var(--tier-strong-bg)', color: 'var(--tier-strong)' }}
              >
                {error}
              </div>
            )}

            {/* Single-mode results */}
            {mode === 'single' && results && (
              <>
                {/* Print-only report header */}
                <div className="hidden print:block border-b border-border pb-4">
                  <h2 className="font-serif text-[22px] text-text-primary">Screening report</h2>
                  <p className="text-[12px] text-text-secondary mt-1">
                    Query &ldquo;{results.query}&rdquo; · threshold {results.min_score.toFixed(2)}
                    {results.program ? ` · program ${results.program}` : ''} · {results.match_count} match{results.match_count !== 1 ? 'es' : ''} ·
                    screened {new Date().toLocaleString()} against OFAC SDN ({stats?.entity_count.toLocaleString() ?? '—'} entities)
                  </p>
                </div>

                <div className="flex items-center justify-between flex-wrap gap-3 no-print">
                  <div className="font-mono text-[12px] text-text-tertiary tracking-[0.02em]">
                    <span className="text-text-primary font-semibold">{results.match_count} matches</span>
                    {'  ·  '}query <span className="text-text-primary">&ldquo;{results.query}&rdquo;</span>
                    {'  ·  '}threshold <span className="text-text-primary">{results.min_score.toFixed(2)}</span>
                    {results.program && (<>{'  ·  '}program <span style={{ color: 'var(--accent)' }}>{results.program}</span></>)}
                  </div>
                  <div className="flex items-center gap-3 text-[12px] text-text-secondary">
                    {tierCounts && (
                      <>
                        <Legend color={TIER_COLOR.strong} label={`${tierCounts.strong} strong`} />
                        <Legend color={TIER_COLOR.probable} label={`${tierCounts.probable} probable`} />
                        <Legend color={TIER_COLOR.weak} label={`${tierCounts.weak} weak`} />
                        <span className="w-px h-3.5 bg-border-strong mx-1" />
                      </>
                    )}
                    <button
                      onClick={() => window.print()}
                      className="text-text-secondary hover:text-text-primary font-medium transition-colors duration-100"
                    >
                      Export PDF
                    </button>
                    <button
                      onClick={exportSingleCsv}
                      disabled={results.matches.length === 0}
                      className="text-text-secondary hover:text-text-primary font-medium transition-colors duration-100 disabled:opacity-50"
                    >
                      Export CSV
                    </button>
                  </div>
                </div>

                <ResultsTable
                  results={results}
                  onDispositionChange={() => setAuditVersion((v) => v + 1)}
                />
              </>
            )}

            {mode === 'single' && loading && !results && <Skeleton />}
            {mode === 'single' && !results && !loading && <ScoringMethodology />}
          </section>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value, sub, last = false }: { label: string; value: string; sub: string; last?: boolean }) {
  return (
    <div className={`px-5 py-4 ${last ? '' : 'md:border-r border-border'}`}>
      <div className="eyebrow">{label}</div>
      <div className="font-mono text-[22px] font-medium text-text-primary mt-1 tracking-[-0.01em]">{value}</div>
      <div className="font-mono text-[10px] text-text-tertiary mt-0.5 uppercase tracking-[0.06em]">{sub}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function Skeleton() {
  return (
    <div className="panel p-3 flex flex-col gap-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-14 rounded-lg bg-surface border border-border opacity-60 pulse" />
      ))}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'recently';
  }
}
