// src/app/api/entity/[entNum]/route.ts
//
// GET /api/entity/:entNum
// Full dossier for one SDN entry: entity row (title, remarks, program),
// every alias, and every address. This is data the ingest already loads
// but the results table has no room for.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ entNum: string }> }
) {
  const { entNum } = await params;
  const id = parseInt(entNum, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'entNum must be a positive integer' }, { status: 400 });
  }

  const [entity, aliases, addresses] = await Promise.all([
    supabaseAdmin
      .from('sanctioned_entities')
      .select('ent_num, sdn_name, sdn_type, program, title, remarks')
      .eq('ent_num', id)
      .maybeSingle(),
    supabaseAdmin
      .from('entity_aliases')
      .select('alt_name, alt_type')
      .eq('ent_num', id)
      .order('alt_name'),
    supabaseAdmin
      .from('entity_addresses')
      .select('address, city_state_zip, country, add_remarks')
      .eq('ent_num', id),
  ]);

  if (entity.error || aliases.error || addresses.error) {
    const message = entity.error?.message ?? aliases.error?.message ?? addresses.error?.message;
    console.error('entity dossier error:', message);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
  if (!entity.data) {
    return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
  }

  return NextResponse.json({
    entity: entity.data,
    aliases: aliases.data ?? [],
    addresses: addresses.data ?? [],
  });
}
