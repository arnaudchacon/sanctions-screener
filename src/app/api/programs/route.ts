// src/app/api/programs/route.ts
//
// GET /api/programs
// Returns sanctions programs with real entity counts via server-side SQL aggregation.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const revalidate = 300;

export async function GET() {
    try {
        const { data, error } = await supabaseAdmin.rpc('get_program_counts');

        if (error) throw error;

        const programs = (data ?? []).map((row: { program_code: string; entity_count: number }) => ({
            code: row.program_code,
            count: Number(row.entity_count),
        }));

        return NextResponse.json({
            programs,
            total: programs.length,
        });
    } catch (err) {
        console.error('programs error:', err);
        return NextResponse.json({ programs: [], total: 0 }, { status: 500 });
    }
}