// scripts/eval-scoring.ts
//
// Scoring regression harness. Runs a fixed set of realistic queries through
// screen_name() and prints the top 3 for each, so scoring changes can be
// compared before/after. Run with: npx tsx scripts/eval-scoring.ts
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const CASES: Array<{ query: string; why: string }> = [
  { query: 'Vladimir Putin',          why: 'reversed word order vs "PUTIN, Vladimir Vladimirovich"' },
  { query: 'Putin, Vladimir',         why: 'punctuated LAST, First form' },
  { query: 'AEROCARIBBEAN AIRLINES',  why: 'exact primary-name match' },
  { query: 'AEROCARIBEAN AIRLINS',    why: 'misspelled entity' },
  { query: 'Mohammed',                why: 'single-token transliteration cluster' },
  { query: 'Sergei Lavrov',           why: 'reversed order, individual' },
  { query: 'Banco Nacional de Cuba',  why: 'multi-word entity' },
  { query: 'XyzqzqzKjqx',             why: 'nonsense — should be empty' },
];

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  for (const c of CASES) {
    const started = Date.now();
    const { data, error } = await supabase.rpc('screen_name', {
      query_name: c.query,
      min_score: 0.3,
      max_results: 3,
      program_filter: null,
    });
    const ms = Date.now() - started;

    console.log(`\n▸ "${c.query}"  (${c.why})  [${ms}ms]`);
    if (error) {
      console.log(`  ERROR: ${error.message}`);
      continue;
    }
    if (!data || data.length === 0) {
      console.log('  (no matches ≥ 0.30)');
      continue;
    }
    for (const m of data) {
      console.log(
        `  ${m.weighted_score.toFixed(3)} ${m.match_tier.padEnd(8)} ${m.sdn_name}` +
        (m.best_alias_name && m.best_alias_name !== m.sdn_name ? `  (aka ${m.best_alias_name})` : '')
      );
    }
  }
  console.log();
}

main().catch((err) => { console.error(err); process.exit(1); });
