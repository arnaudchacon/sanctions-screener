// src/app/api/screen-batch/route.ts
//
// POST /api/screen-batch
//
// Accepts: { names: string[], min_score?: number, program?: string }
// Returns: { screened, min_score, program, rows: [{ name, match_count, top_tier, matches }] }
//
// Screens up to MAX_NAMES names against screen_name(), a few at a time so a
// large batch doesn't open dozens of parallel connections.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const maxDuration = 60;

const MAX_NAMES = 100;
const PER_NAME_RESULTS = 5;
const CONCURRENCY = 5;

type BatchRequest = {
  names?: unknown;
  min_score?: unknown;
  program?: unknown;
};

type ScreenMatch = {
  ent_num: number;
  sdn_name: string;
  weighted_score: number;
  match_tier: 'strong' | 'probable' | 'weak' | 'noise';
  [key: string]: unknown;
};

export async function POST(request: Request) {
  let body: BatchRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawNames = body.names;
  const min_score = body.min_score ?? 0.5;
  const program = body.program ?? null;

  if (!Array.isArray(rawNames) || rawNames.length === 0) {
    return NextResponse.json(
      { error: 'names is required and must be a non-empty array of strings' },
      { status: 400 }
    );
  }
  if (rawNames.some((n) => typeof n !== 'string')) {
    return NextResponse.json({ error: 'every name must be a string' }, { status: 400 });
  }
  if (typeof min_score !== 'number' || min_score < 0 || min_score > 1) {
    return NextResponse.json({ error: 'min_score must be a number between 0 and 1' }, { status: 400 });
  }
  if (program !== null && typeof program !== 'string') {
    return NextResponse.json({ error: 'program must be a string or omitted' }, { status: 400 });
  }

  // Trim, drop empties, dedupe (case-insensitive), cap.
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of rawNames as string[]) {
    const name = raw.trim();
    if (!name) continue;
    const k = name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    names.push(name);
    if (names.length >= MAX_NAMES) break;
  }
  if (names.length === 0) {
    return NextResponse.json({ error: 'no non-empty names provided' }, { status: 400 });
  }

  const rows: Array<{
    name: string;
    match_count: number;
    top_tier: string | null;
    matches: ScreenMatch[];
    error?: string;
  }> = new Array(names.length);

  let next = 0;
  async function worker() {
    while (next < names.length) {
      const i = next++;
      const name = names[i];
      const { data, error } = await supabaseAdmin.rpc('screen_name', {
        query_name: name,
        min_score,
        max_results: PER_NAME_RESULTS,
        program_filter: program,
      });
      if (error) {
        console.error(`screen-batch: "${name}" failed:`, error.message);
        rows[i] = { name, match_count: 0, top_tier: null, matches: [], error: 'screening failed' };
        continue;
      }
      const matches = (data ?? []) as ScreenMatch[];
      rows[i] = {
        name,
        match_count: matches.length,
        top_tier: matches[0]?.match_tier ?? null,
        matches,
      };
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, names.length) }, () => worker())
  );

  return NextResponse.json({
    screened: names.length,
    min_score,
    program,
    rows,
  });
}
