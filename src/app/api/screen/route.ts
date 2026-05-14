// src/app/api/screen/route.ts
//
// POST /api/screen
//
// Accepts: { query: string, min_score?: number, max_results?: number, program?: string }
// Returns: { query, min_score, max_results, program, match_count, matches[] }
//
// Calls the Postgres screen_name() function via Supabase RPC.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

type ScreenRequest = {
  query?: unknown;
  min_score?: unknown;
  max_results?: unknown;
  program?: unknown;
};

type ScreenMatch = {
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

export async function POST(request: Request) {
  // Parse and validate the JSON body
  let body: ScreenRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const query = body.query;
  const min_score = body.min_score ?? 0.5;
  const max_results = body.max_results ?? 20;
  const program = body.program ?? null;

  if (typeof query !== 'string' || query.trim().length === 0) {
    return NextResponse.json(
      { error: 'query is required and must be a non-empty string' },
      { status: 400 }
    );
  }

  if (typeof min_score !== 'number' || min_score < 0 || min_score > 1) {
    return NextResponse.json(
      { error: 'min_score must be a number between 0 and 1' },
      { status: 400 }
    );
  }

  if (
    typeof max_results !== 'number' ||
    max_results < 1 ||
    max_results > 100 ||
    !Number.isInteger(max_results)
  ) {
    return NextResponse.json(
      { error: 'max_results must be an integer between 1 and 100' },
      { status: 400 }
    );
  }

  if (program !== null && typeof program !== 'string') {
    return NextResponse.json(
      { error: 'program must be a string or omitted' },
      { status: 400 }
    );
  }

  // Call the Postgres function
  const { data, error } = await supabaseAdmin.rpc('screen_name', {
    query_name: query,
    min_score,
    max_results,
    program_filter: program,
  });

  if (error) {
    console.error('screen_name RPC error:', error);
    return NextResponse.json(
      { error: 'Screening failed', detail: error.message },
      { status: 500 }
    );
  }

  const matches = (data ?? []) as ScreenMatch[];

  return NextResponse.json({
    query,
    min_score,
    max_results,
    program,
    match_count: matches.length,
    matches,
  });
}
