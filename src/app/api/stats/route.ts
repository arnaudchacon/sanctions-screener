// src/app/api/stats/route.ts
//
// GET /api/stats
// Returns the current database state: entity count and last ingestion timestamp.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const revalidate = 300; // cache for 5 minutes

export async function GET() {
  try {
    const { count, error: countError } = await supabaseAdmin
      .from('sanctioned_entities')
      .select('*', { count: 'exact', head: true });

    if (countError) throw countError;

    const { data: runs, error: runsError } = await supabaseAdmin
      .from('ingestion_runs')
      .select('completed_at')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1);

    if (runsError) throw runsError;

    return NextResponse.json({
      entity_count: count ?? 0,
      last_refreshed: runs?.[0]?.completed_at ?? null,
    });
  } catch (err) {
    console.error('stats error:', err);
    return NextResponse.json(
      { entity_count: 0, last_refreshed: null },
      { status: 500 }
    );
  }
}
