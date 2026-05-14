// src/app/page.tsx
'use client';

import { useState } from 'react';

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

const EXAMPLE_QUERIES = ['Mohammed', 'Aerocaribbean Airlines', 'Banco Nacional', 'Putin'];

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [threshold, setThreshold] = useState(0.5);
  const [program, setProgram] = useState('');
  const [results, setResults] = useState<ScreenResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  function handleExampleClick(example: string) {
    setQuery(example);
    handleSearch(example);
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="mb-10 pb-8 border-b border-gray-200">
          <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">
            OFAC SDN Screening
          </div>
          <h1 className="text-3xl font-semibold text-gray-900 mb-3">
            Sanctions Screener
          </h1>
          <p className="text-sm text-gray-600 leading-relaxed max-w-2xl">
            Fuzzy name matching against the U.S. Treasury Office of Foreign Assets Control
            Specially Designated Nationals list. Combines weighted Levenshtein distance, phonetic
            matching (Soundex), and substring containment to surface candidate matches across
            transliteration variants and aliases.
          </p>
        </header>

        {/* Search controls */}
        <section className="mb-8 space-y-5">
          <div>
            <label htmlFor="query" className="block text-xs uppercase tracking-wide text-gray-600 mb-2">
              Name or entity
            </label>
            <div className="flex gap-2">
              <input
                id="query"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Type a name to screen"
                className="flex-1 px-3 py-2 border border-gray-300 bg-white focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none text-sm"
              />
              <button
                onClick={() => handleSearch()}
                disabled={loading || !query.trim()}
                className="px-6 py-2 bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Screening…' : 'Screen'}
              </button>
            </div>
            <div className="mt-2 text-xs text-gray-500">
              Try:{' '}
              {EXAMPLE_QUERIES.map((ex, i) => (
                <span key={ex}>
                  <button
                    onClick={() => handleExampleClick(ex)}
                    className="underline hover:text-gray-900"
                  >
                    {ex}
                  </button>
                  {i < EXAMPLE_QUERIES.length - 1 && ', '}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label htmlFor="threshold" className="block text-xs uppercase tracking-wide text-gray-600 mb-2">
                Min. confidence:{' '}
                <span className="font-mono text-gray-900">{threshold.toFixed(2)}</span>
              </label>
              <input
                id="threshold"
                type="range"
                min="0.1"
                max="0.95"
                step="0.05"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="w-full accent-gray-900"
              />
              <div className="flex justify-between text-[10px] uppercase tracking-wide text-gray-500 mt-1">
                <span>More results</span>
                <span>Stricter</span>
              </div>
            </div>

            <div>
              <label htmlFor="program" className="block text-xs uppercase tracking-wide text-gray-600 mb-2">
                Program filter (optional)
              </label>
              <input
                id="program"
                type="text"
                value={program}
                onChange={(e) => setProgram(e.target.value)}
                placeholder="e.g., CUBA, SDGT, RUSSIA-EO14024"
                className="w-full px-3 py-2 border border-gray-300 bg-white focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none text-sm font-mono"
              />
            </div>
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 text-red-900 text-sm">
            {error}
          </div>
        )}

        {/* Results */}
        {results && (
          <section>
            <div className="text-xs text-gray-600 mb-4 font-mono uppercase tracking-wide">
              {results.match_count} {results.match_count === 1 ? 'match' : 'matches'}
              {' · query "'}
              <span className="text-gray-900">{results.query}</span>
              {'"'}
              {results.program && (
                <>
                  {' · program '}
                  <span className="text-gray-900">{results.program}</span>
                </>
              )}
              {' · threshold '}
              <span className="text-gray-900">{results.min_score.toFixed(2)}</span>
            </div>

            {results.matches.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-gray-500 border border-gray-200">
                No matches above threshold. Try lowering minimum confidence or removing the program filter.
              </div>
            ) : (
              <div className="space-y-2">
                {results.matches.map((match) => (
                  <MatchCard key={match.ent_num} match={match} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-6 border-t border-gray-200 text-xs text-gray-500 space-y-1">
          <p>
            Data: U.S. Treasury OFAC Specially Designated Nationals List, publicly available at
            ofac.treasury.gov/sanctions-list-service. Scoring methodology applies weighted
            Levenshtein distance (40% primary name, 40% best alias), tokenized Soundex phonetic
            matching (20%), and substring containment as a score floor.
          </p>
          <p>
            This tool is a demonstration of fuzzy matching methodology for portfolio purposes.
            It is not a substitute for production sanctions screening software.
          </p>
        </footer>
      </div>
    </main>
  );
}

function MatchCard({ match }: { match: Match }) {
  const tierStyles = {
    strong: { card: 'border-red-300 bg-red-50/50', badge: 'bg-red-600 text-white' },
    probable: { card: 'border-amber-300 bg-amber-50/50', badge: 'bg-amber-600 text-white' },
    weak: { card: 'border-slate-300 bg-slate-50/50', badge: 'bg-slate-500 text-white' },
    noise: { card: 'border-gray-200 bg-gray-50', badge: 'bg-gray-400 text-white' },
  };

  const styles = tierStyles[match.match_tier];

  return (
    <div className={`p-4 border ${styles.card}`}>
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 text-sm">{match.sdn_name}</h3>
          {match.best_alias_name && match.best_alias_name !== match.sdn_name && (
            <p className="text-xs text-gray-600 mt-0.5">
              Alias:{' '}
              <span className="font-mono text-gray-900">{match.best_alias_name}</span>
            </p>
          )}
        </div>
        <span className={`shrink-0 px-2 py-0.5 text-[10px] uppercase tracking-widest ${styles.badge}`}>
          {match.match_tier}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600 mb-3 font-mono">
        <span>#{match.ent_num}</span>
        {match.sdn_type && <span>{match.sdn_type}</span>}
        {match.program && <span>{match.program}</span>}
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs">
        <ScoreCell label="Primary" value={match.primary_name_score} weight={0.4} />
        <ScoreCell label="Alias" value={match.best_alias_score} weight={0.4} />
        <ScoreCell label="Phonetic" value={match.phonetic_score} weight={0.2} />
        <ScoreCell label="Weighted" value={match.weighted_score} bold />
      </div>
    </div>
  );
}

function ScoreCell({
  label,
  value,
  weight,
  bold,
}: {
  label: string;
  value: number;
  weight?: number;
  bold?: boolean;
}) {
  return (
    <div className="bg-white border border-gray-200 px-2 py-1">
      <div className="text-[9px] uppercase tracking-widest text-gray-500">
        {label}
        {weight !== undefined && (
          <span className="text-gray-400 ml-1">×{weight.toFixed(2)}</span>
        )}
      </div>
      <div className={`font-mono text-gray-900 ${bold ? 'font-semibold' : ''}`}>
        {value.toFixed(3)}
      </div>
    </div>
  );
}
