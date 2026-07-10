// src/lib/explain.ts
//
// Client-side mirror of the SQL token-set scoring, used to visualize WHY a
// name matched: each query token aligned to its best counterpart among the
// name's tokens with a per-pair similarity.

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (a.length > b.length) [a, b] = [b, a];

  let prev = new Array<number>(a.length + 1);
  let curr = new Array<number>(a.length + 1);
  for (let j = 0; j <= a.length; j++) prev[j] = j;

  for (let i = 1; i <= b.length; i++) {
    curr[0] = i;
    const bChar = b.charCodeAt(i - 1);
    for (let j = 1; j <= a.length; j++) {
      curr[j] = bChar === a.charCodeAt(j - 1)
        ? prev[j - 1]
        : Math.min(prev[j - 1] + 1, curr[j - 1] + 1, prev[j] + 1);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[a.length];
}

export function levSim(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return Math.max(0, 1 - levenshtein(a, b) / maxLen);
}

export function tokenize(t: string): string[] {
  return t
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export interface TokenAlignment {
  queryToken: string;
  nameToken: string | null;
  similarity: number;
}

export interface Explanation {
  alignments: TokenAlignment[];
  unmatchedNameTokens: string[];
}

// For each query token, find its best-matching name token (the same pairing
// the SQL token_set_sim uses). Name tokens can match multiple query tokens —
// matching the DB behavior, which takes MAX per query token independently.
export function explainMatch(query: string, name: string): Explanation {
  const qTokens = tokenize(query);
  const nTokens = tokenize(name);

  const usedName = new Set<string>();
  const alignments: TokenAlignment[] = qTokens.map((qt) => {
    let best: string | null = null;
    let bestSim = 0;
    for (const nt of nTokens) {
      const s = levSim(qt, nt);
      if (s > bestSim) {
        bestSim = s;
        best = nt;
      }
    }
    if (best && bestSim > 0.3) usedName.add(best);
    return { queryToken: qt, nameToken: bestSim > 0.3 ? best : null, similarity: bestSim };
  });

  return {
    alignments,
    unmatchedNameTokens: nTokens.filter((nt) => !usedName.has(nt)),
  };
}
