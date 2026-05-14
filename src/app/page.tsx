// src/app/page.tsx
// Sentinel — Sanctions Screener
// Reads from /api/stats, /api/programs, /api/screen.

'use client';

import { useEffect, useMemo, useState } from 'react';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type Match = {
  ent_num: number;
  sdn_name: string;
  sdn_type: string | null;
  program: string | null;
  primary_name_score: number;
  best_alias_score: number;
  best_alias_name: string | null;
  phonetic_score: number;
  weighted_score: number;
  match_tier: 'strong' | 'probable' | 'weak' | 'noise';
};

type ScreenResponse = {
  query: string;
  min_score: number;
  max_results: number;
  program: string | null;
  match_count: number;
  matches: Match[];
};

type Stats = { entity_count: number; last_refreshed: string | null };
type Program = { code: string; count: number };
type HistoryItem = { q: string; n: number; tier: Match['match_tier']; at: number };

// ─────────────────────────────────────────────
// Static reference data
// ─────────────────────────────────────────────

const EXAMPLE_QUERIES = ['Mohammed', 'Aerocaribbean Airlines', 'Banco Nacional', 'Putin'];
const HISTORY_KEY = 'sentinel.history.v1';
const SIDEBAR_PROGRAM_LIMIT = 10;

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [threshold, setThreshold] = useState(0.5);
  const [program, setProgram] = useState('');
  const [sort, setSort] = useState<'score' | 'name' | 'program'>('score');
  const [results, setResults] = useState<ScreenResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

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
    setOpenId(null);
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
      const topTier = data.matches[0]?.match_tier ?? 'noise';
      const entry: HistoryItem = { q, n: data.match_count, tier: topTier, at: Date.now() };
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

  const sorted = useMemo(() => {
    if (!results) return [];
    const rows = [...results.matches];
    if (sort === 'score')   rows.sort((a, b) => b.weighted_score - a.weighted_score);
    if (sort === 'name')    rows.sort((a, b) => a.sdn_name.localeCompare(b.sdn_name));
    if (sort === 'program') rows.sort((a, b) => (a.program || '').localeCompare(b.program || ''));
    return rows;
  }, [results, sort]);

  const tierCounts = useMemo(() => {
    const init = { strong: 0, probable: 0, weak: 0, noise: 0 };
    sorted.forEach((m) => (init[m.match_tier] += 1));
    return init;
  }, [sorted]);

  const currentTier = thresholdToTier(threshold);

  return (
    <main style={{ background: 'var(--c-paper)', color: 'var(--c-ink)', minHeight: '100vh' }}>

      {/* Top chrome — lockup + live pill, nav and multi-jurisdiction eyebrow removed */}
      <header
        style={{
          borderBottom: '1px solid var(--c-line)',
          background: 'var(--c-surface)',
          padding: '14px 32px',
          display: 'flex',
          alignItems: 'center',
          gap: 28,
        }}
      >
        <Lockup />
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 11 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              background: 'color-mix(in oklch, oklch(55% 0.14 150) 12%, transparent)',
              color: 'oklch(38% 0.14 150)',
              border: '1px solid color-mix(in oklch, oklch(55% 0.14 150) 30%, transparent)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'oklch(55% 0.14 150)',
                animation: 's-pulse 1.6s infinite',
              }}
            />
            Live · OFAC SDN
          </span>
        </div>
      </header>

      {/* Stat strip — all values now sourced from real APIs */}
      <div style={{ padding: '20px 32px 0' }}>
        <div className="s-stat-strip">
          <Stat label="Source"           value="OFAC SDN" sub="U.S. TREASURY" />
          <Stat label="Entities indexed" value={stats ? stats.entity_count.toLocaleString() : '—'} sub="public-domain" />
          <Stat label="Last refresh"     value={stats?.last_refreshed ? formatRefreshDate(stats.last_refreshed) : '—'} sub="from ingestion log" />
          <Stat label="Programs covered" value={programs.length > 0 ? programs.length.toString() : '—'} sub="distinct codes" />
        </div>
      </div>

      {/* Body grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', padding: '24px 32px 40px', gap: 24 }}>

        {/* Sidebar */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <RecentScreenings history={history} onPick={(h) => { setQuery(h.q); handleSearch(h.q); }} current={query} />
          <ProgramsList
            programs={programs}
            active={program}
            onPick={(code) => setProgram(program === code ? '' : code)}
          />
        </aside>

        {/* Main */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0 }}>

          {/* Page title */}
          <div>
            <div className="s-eyebrow" style={{ color: 'var(--c-brand)' }}>
              Sanctions screening / Single name
            </div>
            <h1
              style={{
                fontSize: 32,
                fontWeight: 600,
                letterSpacing: '-0.025em',
                margin: '8px 0 6px',
              }}
            >
              Name screening console
            </h1>
            <p style={{ fontSize: 14, color: 'var(--c-muted)', margin: 0, maxWidth: 640, lineHeight: 1.55 }}>
              Fuzzy match a single counterparty against OFAC SDN. Weighted Levenshtein + tokenized Soundex + substring containment.
            </p>
          </div>

          {/* Command bar — Bulk CSV button removed, grid now 2 columns */}
          <div className="s-panel s-corner-ticks" style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
              <div style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--c-strong)',
                    pointerEvents: 'none',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                  }}
                >
                  Q&nbsp;&gt;
                </span>
                <input
                  className="s-input"
                  style={{ paddingLeft: 42, fontSize: 16, fontWeight: 500, height: 50 }}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Counterparty name or entity"
                />
              </div>
              <button
                className="s-btn"
                style={{ height: 50, padding: '0 22px' }}
                onClick={() => handleSearch()}
                disabled={loading || !query.trim()}
              >
                {loading ? 'Screening…' : 'Screen'}
              </button>
            </div>

            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--c-muted)' }}>
              Try:{' '}
              {EXAMPLE_QUERIES.map((ex, i) => (
                <span key={ex}>
                  <button
                    onClick={() => { setQuery(ex); handleSearch(ex); }}
                    style={{
                      background: 'none',
                      border: 0,
                      padding: 0,
                      color: 'var(--c-ink)',
                      textDecoration: 'underline',
                      textDecorationColor: 'var(--c-faint)',
                      textUnderlineOffset: 3,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: 12,
                    }}
                  >
                    {ex}
                  </button>
                  {i < EXAMPLE_QUERIES.length - 1 && ', '}
                </span>
              ))}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 1fr 1fr',
                gap: 28,
                marginTop: 18,
                paddingTop: 18,
                borderTop: '1px solid var(--c-line)',
              }}
            >
              <ThresholdSlider value={threshold} onChange={setThreshold} tier={currentTier} />

              <div>
                <div className="s-eyebrow" style={{ marginBottom: 8 }}>Program filter</div>
                <input
                  className="s-input s-input-mono"
                  value={program}
                  onChange={(e) => setProgram(e.target.value)}
                  placeholder="e.g. SDGT, RUSSIA-EO14024"
                  style={{ height: 36 }}
                />
              </div>

              <div>
                <div className="s-eyebrow" style={{ marginBottom: 8 }}>Sort</div>
                <Segmented value={sort} onChange={(v) => setSort(v as 'score' | 'name' | 'program')} options={[
                  { id: 'score',   l: 'Score' },
                  { id: 'name',    l: 'Name' },
                  { id: 'program', l: 'Program' },
                ]} />
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                padding: '12px 16px',
                background: 'color-mix(in oklch, var(--c-strong) 6%, transparent)',
                border: '1px solid color-mix(in oklch, var(--c-strong) 30%, transparent)',
                color: 'var(--c-strong)',
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {/* Results header / body — PDF button removed, CSV button now functional */}
          {results && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div className="s-mono" style={{ fontSize: 12, color: 'var(--c-muted)', letterSpacing: '0.04em' }}>
                  <span style={{ color: 'var(--c-ink)', fontWeight: 600 }}>{results.match_count} matches</span>
                  {'  ·  '}query <span style={{ color: 'var(--c-ink)' }}>&quot;{results.query}&quot;</span>
                  {'  ·  '}threshold <span style={{ color: 'var(--c-ink)' }}>{results.min_score.toFixed(2)}</span>
                  {results.program && (<>{'  ·  '}program <span style={{ color: 'var(--c-strong)' }}>{results.program}</span></>)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--c-muted)' }}>
                  <TierLegend count={tierCounts.strong}   tier="strong"   />
                  <TierLegend count={tierCounts.probable} tier="probable" />
                  <TierLegend count={tierCounts.weak}     tier="weak"     />
                  <span style={{ width: 1, height: 14, background: 'var(--c-line-2)', margin: '0 6px' }} />
                  <button
                    className="s-btn s-btn-sm s-btn-ghost"
                    onClick={() => exportToCSV(results)}
                    disabled={results.matches.length === 0}
                  >
                    Export · CSV
                  </button>
                </div>
              </div>

              <div className="s-panel" style={{ padding: 0, overflow: 'hidden' }}>
                {sorted.length === 0 ? (
                  <div style={{ padding: 56, textAlign: 'center', color: 'var(--c-muted)', fontSize: 13 }}>
                    No matches above threshold {results.min_score.toFixed(2)}. Try lowering minimum confidence or removing the program filter.
                  </div>
                ) : (
                  <table className="s-table">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>#</th>
                        <th>Entity / alias</th>
                        <th>Type</th>
                        <th>Program</th>
                        <th>Weighted</th>
                        <th>Tier</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((m, i) => (
                        <ResultRow
                          key={m.ent_num}
                          idx={i}
                          match={m}
                          isOpen={openId === m.ent_num}
                          onToggle={() => setOpenId(openId === m.ent_num ? null : m.ent_num)}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {loading && !results && <ResultsSkeleton />}

          {!results && !loading && <ScoringMethodology />}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: 10,
              fontSize: 11,
              color: 'var(--c-muted)',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <span>
              Sentinel · OFAC SDN data licensed public-domain · Demonstration tool. Not a substitute for production sanctions screening software.
            </span>
            <span className="s-mono">© 2026 SENTINEL</span>
          </div>
        </section>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────

function Lockup() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden>
        <rect x="2.5" y="2.5" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.2" transform="rotate(45 10 10)" />
        <circle cx="10" cy="10" r="2.2" fill="currentColor" />
        <line x1="10" y1="0" x2="10" y2="3.5" stroke="currentColor" strokeWidth="1" />
        <line x1="10" y1="16.5" x2="10" y2="20" stroke="currentColor" strokeWidth="1" />
        <line x1="0" y1="10" x2="3.5" y2="10" stroke="currentColor" strokeWidth="1" />
        <line x1="16.5" y1="10" x2="20" y2="10" stroke="currentColor" strokeWidth="1" />
      </svg>
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontWeight: 600, letterSpacing: '0.02em', fontSize: 16, color: 'var(--c-ink)' }}>
          SENTINEL
        </div>
        <div className="s-eyebrow" style={{ fontSize: 9, marginTop: 3 }}>
          Compliance Intelligence
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="s-eyebrow">{label}</div>
      <div className="s-stat-val">{value}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--c-muted)', marginTop: 3 }}>
        {sub}
      </div>
    </div>
  );
}

function ThresholdSlider({
  value, onChange, tier,
}: {
  value: number;
  onChange: (v: number) => void;
  tier: 'strong' | 'probable' | 'weak' | 'noise';
}) {
  const min = 0.1, max = 0.95;
  const p = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <div className="s-eyebrow">Min. confidence threshold</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="s-num" style={{ fontSize: 13 }}>{value.toFixed(2)}</span>
          <span className="s-eyebrow" style={{ color: `var(--c-${tier})` }}>{tier}</span>
        </div>
      </div>
      <input
        type="range"
        className="s-range"
        min={min} max={max} step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ '--p': `${p}%` } as React.CSSProperties}
      />
      <div style={{ position: 'relative', height: 14, marginTop: 2 }}>
        {[
          { v: 0.10, l: 'noise' },
          { v: 0.40, l: 'weak' },
          { v: 0.65, l: 'probable' },
          { v: 0.80, l: 'strong' },
        ].map((m) => (
          <span
            key={m.l}
            className="s-eyebrow"
            style={{
              position: 'absolute',
              left: `${((m.v - min) / (max - min)) * 100}%`,
              fontSize: 9,
              color: m.l === tier ? `var(--c-${tier})` : 'var(--c-dim)',
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

function Segmented({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; l: string }>;
}) {
  return (
    <div style={{ display: 'flex', border: '1px solid var(--c-line-2)' }}>
      {options.map((o, i) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          style={{
            flex: 1,
            border: 0,
            borderRight: i < options.length - 1 ? '1px solid var(--c-line-2)' : 0,
            padding: '9px 10px',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            background: value === o.id ? 'var(--c-ink)' : 'transparent',
            color: value === o.id ? 'var(--c-paper)' : 'var(--c-ink-2)',
            cursor: 'pointer',
          }}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function TierLegend({ count, tier }: { count: number; tier: Match['match_tier'] }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span className="s-tier-dot" style={{ background: `var(--c-${tier})` }} />
      {count} {tier}
    </span>
  );
}

function RecentScreenings({
  history, onPick, current,
}: {
  history: HistoryItem[];
  onPick: (h: HistoryItem) => void;
  current: string;
}) {
  if (!history.length) return null;
  return (
    <div className="s-panel">
      <div className="s-panel-head">
        <span className="s-eyebrow s-eyebrow-ink">Recent screenings</span>
        <span className="s-eyebrow">{history.length}</span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {history.map((h, i) => (
          <li
            key={i}
            onClick={() => onPick(h)}
            style={{
              padding: '11px 14px',
              borderBottom: i < history.length - 1 ? '1px solid var(--c-line)' : 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: h.q === current ? 'var(--c-surface-2)' : 'transparent',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: `var(--c-${h.tier})`, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--c-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {h.q}
            </span>
            <span className="s-num" style={{ fontSize: 10, color: 'var(--c-muted)' }}>{h.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProgramsList({
  programs, active, onPick,
}: {
  programs: Program[];
  active: string;
  onPick: (code: string) => void;
}) {
  const shown = programs.slice(0, SIDEBAR_PROGRAM_LIMIT);
  return (
    <div className="s-panel">
      <div className="s-panel-head">
        <span className="s-eyebrow s-eyebrow-ink">Programs</span>
        <span className="s-eyebrow">
          {programs.length > 0 ? `${shown.length} / ${programs.length}` : '—'}
        </span>
      </div>
      {programs.length === 0 ? (
        <div style={{ padding: 14, fontSize: 12, color: 'var(--c-muted)' }}>
          Loading…
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {shown.map((p, i) => {
            const isActive = active === p.code;
            return (
              <li
                key={p.code}
                onClick={() => onPick(p.code)}
                style={{
                  padding: '11px 14px',
                  borderBottom: i < shown.length - 1 ? '1px solid var(--c-line)' : 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: isActive ? 'color-mix(in oklch, var(--c-strong) 8%, transparent)' : 'transparent',
                  borderLeft: isActive ? '2px solid var(--c-strong)' : '2px solid transparent',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: isActive ? 'var(--c-strong)' : 'var(--c-ink-2)',
                    flex: 1,
                    fontWeight: isActive ? 600 : 500,
                  }}
                >
                  {p.code}
                </span>
                <span className="s-num" style={{ fontSize: 10, color: 'var(--c-muted)' }}>
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

function ResultRow({
  match, idx, isOpen, onToggle,
}: {
  match: Match;
  idx: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const tier = match.match_tier;
  return (
    <>
      <tr className={`s-row-${tier} ${isOpen ? 'is-open' : ''}`} onClick={onToggle} style={{ cursor: 'pointer' }}>
        <td style={{ width: 36, color: 'var(--c-faint)' }} className="s-num">
          <span style={{ fontSize: 11 }}>{String(idx + 1).padStart(2, '0')}</span>
        </td>
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: `var(--c-${tier})`, flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.005em', fontSize: 14 }}>
                {match.sdn_name}
              </div>
              {match.best_alias_name && match.best_alias_name !== match.sdn_name && (
                <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 3 }}>
                  aka <span className="s-mono">{match.best_alias_name}</span>
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="s-num" style={{ fontSize: 12, color: 'var(--c-muted)' }}>
          {match.sdn_type === 'entity' ? 'Entity' : match.sdn_type === 'individual' ? 'Individual' : (match.sdn_type ?? '—')}
        </td>
        <td className="s-mono" style={{ fontSize: 11, color: 'var(--c-ink-2)' }}>
          {match.program ?? '—'}
        </td>
        <td style={{ width: 170 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 90 }}>
            <div className="s-bar" style={{ flex: 1 }}>
              <i style={{ width: `${Math.max(2, match.weighted_score * 100)}%`, background: `var(--c-${tier})` } as React.CSSProperties} />
            </div>
            <span className="s-num" style={{ fontSize: 11, color: 'var(--c-ink)', minWidth: 38, textAlign: 'right' }}>
              {match.weighted_score.toFixed(3)}
            </span>
          </div>
        </td>
        <td style={{ width: 110 }}>
          <span className={`s-tier s-tier-${tier}`}>
            <span className="s-tier-dot" />
            {tier}
          </span>
        </td>
        <td style={{ width: 32, textAlign: 'right', color: 'var(--c-dim)' }}>
          <svg width="11" height="11" viewBox="0 0 10 10" style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform 120ms' }}>
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" fill="none" strokeWidth="1.4" />
          </svg>
        </td>
      </tr>
      {isOpen && (
        <tr className="s-rowexp">
          <td colSpan={7}>
            <div className="s-rowexp-inner">
              <ExpandedDetail match={match} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedDetail({ match }: { match: Match }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 32 }}>
      <div>
        <div className="s-eyebrow" style={{ marginBottom: 8 }}>Identity</div>
        <DefLine label="SDN #"   value={`#${match.ent_num}`}                                  mono />
        <DefLine label="Type"    value={match.sdn_type ?? '—'} />
        <DefLine label="Program" value={match.program ?? '—'}                                  mono />
        {match.best_alias_name && match.best_alias_name !== match.sdn_name && (
          <DefLine label="Best alias" value={match.best_alias_name} mono />
        )}
      </div>
      <div>
        <div className="s-eyebrow" style={{ marginBottom: 8 }}>Score decomposition</div>
        <ScoreLine label="Primary"    weight={0.4} value={match.primary_name_score} />
        <ScoreLine label="Best alias" weight={0.4} value={match.best_alias_score} />
        <ScoreLine label="Phonetic"   weight={0.2} value={match.phonetic_score} />
        <div
          style={{
            borderTop: '1px solid var(--c-line-2)',
            paddingTop: 6,
            marginTop: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--c-ink)' }}>Weighted</span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              fontWeight: 600,
              color: `var(--c-${match.match_tier})`,
            }}
          >
            {match.weighted_score.toFixed(3)}
          </span>
        </div>
      </div>
    </div>
  );
}

function DefLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 12, padding: '3px 0', fontSize: 12 }}>
      <span
        style={{
          color: 'var(--c-muted)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span className={mono ? 's-mono' : ''} style={{ color: 'var(--c-ink)' }}>
        {value}
      </span>
    </div>
  );
}

function ScoreLine({ label, weight, value }: { label: string; weight: number; value: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '3px 0',
        fontSize: 12,
      }}
    >
      <div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--c-ink-2)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--c-dim)', marginLeft: 6 }}>
          ×{weight.toFixed(2)}
        </span>
      </div>
      <div style={{ flex: 1, maxWidth: 140 }}>
        <div className="s-bar"><i style={{ width: `${value * 100}%` }} /></div>
      </div>
      <span className="s-num" style={{ fontSize: 11, color: 'var(--c-ink)', minWidth: 38, textAlign: 'right' }}>
        {value.toFixed(3)}
      </span>
    </div>
  );
}

function ScoringMethodology() {
  return (
    <div className="s-panel">
      <div className="s-panel-head">
        <span className="s-eyebrow s-eyebrow-ink">Scoring methodology</span>
        <span className="s-eyebrow">levenshtein · soundex · containment</span>
      </div>
      <div style={{ padding: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        <div>
          <div className="s-eyebrow" style={{ marginBottom: 8 }}>Weighted formula</div>
          <div className="s-mono" style={{ fontSize: 12, lineHeight: 1.8, color: 'var(--c-ink)' }}>
            <div>primary_name_score × 0.40</div>
            <div>+ best_alias_score × 0.40</div>
            <div>+ phonetic_score × 0.20</div>
          </div>
        </div>
        <div>
          <div className="s-eyebrow" style={{ marginBottom: 8 }}>Tier thresholds</div>
          <div className="s-mono" style={{ fontSize: 12, lineHeight: 1.8 }}>
            <div><span style={{ color: 'var(--c-strong)' }}>strong</span>{'   '}≥ 0.80</div>
            <div><span style={{ color: 'var(--c-probable)' }}>probable</span> ≥ 0.65</div>
            <div><span style={{ color: 'var(--c-weak)' }}>weak</span>{'     '}≥ 0.40</div>
            <div><span style={{ color: 'var(--c-dim)' }}>noise</span>{'    '}&lt; 0.40</div>
          </div>
        </div>
        <div style={{ gridColumn: '1 / -1', fontSize: 13, color: 'var(--c-ink-2)', lineHeight: 1.6, paddingTop: 8, borderTop: '1px solid var(--c-line)' }}>
          Levenshtein distance produces an edit-similarity score against the entity&apos;s primary name and its best-matching alias. Tokenized Soundex flags transliteration variants across word boundaries. Substring containment applies a 0.60 floor when the query is literally inside the name, protecting partial-name matches from length-penalty artifacts.
        </div>
      </div>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="s-panel" style={{ padding: 0 }}>
      <div className="s-panel-head">
        <span className="s-eyebrow s-eyebrow-ink">Screening…</span>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              height: 56,
              background: 'var(--c-surface-2)',
              border: '1px solid var(--c-line)',
              opacity: 0.6,
              animation: 's-pulse 1.4s ease-in-out infinite',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function thresholdToTier(t: number): 'noise' | 'weak' | 'probable' | 'strong' {
  if (t >= 0.8) return 'strong';
  if (t >= 0.65) return 'probable';
  if (t >= 0.4) return 'weak';
  return 'noise';
}

function formatRefreshDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return 'recently';
  }
}

function exportToCSV(results: ScreenResponse) {
  const headers = [
    'Rank',
    'Entity Name',
    'Best Alias',
    'Type',
    'Program',
    'Primary Score',
    'Alias Score',
    'Phonetic Score',
    'Weighted Score',
    'Tier',
    'SDN Number',
  ];

  const escape = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = results.matches.map((m, i) => [
    i + 1,
    escape(m.sdn_name),
    escape(m.best_alias_name),
    escape(m.sdn_type),
    escape(m.program),
    m.primary_name_score.toFixed(4),
    m.best_alias_score.toFixed(4),
    m.phonetic_score.toFixed(4),
    m.weighted_score.toFixed(4),
    m.match_tier,
    m.ent_num,
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const stamp = new Date().toISOString().split('T')[0];
  const safeQuery = results.query.replace(/[^a-z0-9]/gi, '-').slice(0, 40);
  link.setAttribute('download', `sentinel-${safeQuery}-${stamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
