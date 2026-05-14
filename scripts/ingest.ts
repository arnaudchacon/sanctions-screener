// scripts/ingest.ts
//
// Reads the four OFAC CSV files from data/raw/ and loads them into Supabase.
// Run with: npx tsx scripts/ingest.ts
//
// Idempotent: truncates existing data before loading, so you can re-run safely
// to pick up the latest OFAC data.

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { Client } from 'pg';
import { parse } from 'csv-parse';
import { createReadStream } from 'fs';

// ──────────────────────────────────────────────────────────────────
// Column definitions (from OFAC's DAT_SPEC.TXT, no header in CSVs)
// ──────────────────────────────────────────────────────────────────

const SDN_COLUMNS = [
  'ent_num', 'sdn_name', 'sdn_type', 'program', 'title',
  'call_sign', 'vess_type', 'tonnage', 'grt',
  'vess_flag', 'vess_owner', 'remarks',
];

const ALT_COLUMNS = [
  'ent_num', 'alt_num', 'alt_type', 'alt_name', 'alt_remarks',
];

const ADD_COLUMNS = [
  'ent_num', 'add_num', 'address', 'city_state_zip', 'country', 'add_remarks',
];

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

// OFAC uses "-0-" as their null marker. Convert it (and empty strings)
// to actual null for clean database storage.
function cleanField(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (trimmed === '-0-' || trimmed === '') return null;
  return trimmed;
}

// Convert a string field to an integer, or null if invalid/missing.
function toInt(value: string | null | undefined): number | null {
  const cleaned = cleanField(value);
  if (cleaned === null) return null;
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? null : n;
}

// Stream a CSV file and return all rows as objects keyed by column name.
async function parseCSV(
  filepath: string,
  columns: string[]
): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const records: Record<string, string>[] = [];
    createReadStream(filepath)
      .pipe(
        parse({
          columns: columns,
          skip_empty_lines: true,
          trim: true,                 // strips leading/trailing whitespace from each field
          relax_quotes: true,         // forgives minor quote weirdness
          relax_column_count: true,   // forgives rows with extra/missing columns
        })
      )
      .on('data', (record) => records.push(record))
      .on('end', () => resolve(records))
      .on('error', reject);
  });
}

// Insert many rows in batches. One giant INSERT-with-many-VALUES per batch.
// Much faster than 12,000 individual INSERTs.
async function batchInsert(
  client: Client,
  table: string,
  columns: string[],
  rows: (string | number | null)[][],
  batchSize = 1000
): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    if (batch.length === 0) continue;

    // Build the parameter placeholders: ($1,$2,$3), ($4,$5,$6), ...
    const placeholders = batch
      .map(
        (_, batchIdx) =>
          `(${columns
            .map((_, colIdx) => `$${batchIdx * columns.length + colIdx + 1}`)
            .join(', ')})`
      )
      .join(', ');

    const values = batch.flat();
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`;

    await client.query(sql, values);
    inserted += batch.length;
    process.stdout.write(`\r  Inserted ${inserted} of ${rows.length}...`);
  }
  process.stdout.write('\n');
  return inserted;
}

// ──────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL not found. Make sure .env.local exists and contains DATABASE_URL.'
    );
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  console.log('✓ Connected to Supabase');

  // Start an ingestion run record
  const runResult = await client.query(
    `INSERT INTO ingestion_runs (status) VALUES ('running') RETURNING run_id`
  );
  const runId = runResult.rows[0].run_id;
  console.log(`✓ Started ingestion run #${runId}`);

  try {
    // 1. Read the CSV files
    console.log('\nReading OFAC CSV files...');
    const sdnRows = await parseCSV('data/raw/SDN.CSV', SDN_COLUMNS);
    console.log(`  SDN.CSV: ${sdnRows.length} rows`);
    const altRows = await parseCSV('data/raw/ALT.CSV', ALT_COLUMNS);
    console.log(`  ALT.CSV: ${altRows.length} rows`);
    const addRows = await parseCSV('data/raw/ADD.CSV', ADD_COLUMNS);
    console.log(`  ADD.CSV: ${addRows.length} rows`);

    // 2. Truncate existing data. CASCADE clears children (aliases/addresses)
    //    automatically. This makes the script idempotent — safe to re-run.
    console.log('\nClearing existing data...');
    await client.query(
      'TRUNCATE entity_addresses, entity_aliases, sanctioned_entities CASCADE'
    );
    console.log('✓ Tables cleared');

    // 3. Transform and insert entities. Drop rows that are missing the two
    //    fields we need (ent_num and name).
    console.log('\nInserting sanctioned entities...');
    const entityRows = sdnRows
      .map((r) => [
        toInt(r.ent_num),
        cleanField(r.sdn_name),
        cleanField(r.sdn_type),
        cleanField(r.program),
        cleanField(r.title),
        cleanField(r.call_sign),
        cleanField(r.vess_type),
        cleanField(r.tonnage),
        cleanField(r.grt),
        cleanField(r.vess_flag),
        cleanField(r.vess_owner),
        cleanField(r.remarks),
      ])
      .filter((r) => r[0] !== null && r[1] !== null);

    const entitiesInserted = await batchInsert(
      client,
      'sanctioned_entities',
      [
        'ent_num', 'sdn_name', 'sdn_type', 'program', 'title',
        'call_sign', 'vess_type', 'tonnage', 'grt',
        'vess_flag', 'vess_owner', 'remarks',
      ],
      entityRows
    );

    // Keep track of valid ent_nums so we can filter orphan aliases/addresses
    const validEntNums = new Set(entityRows.map((r) => r[0] as number));

    // 4. Insert aliases (only those linked to valid entities)
    console.log('\nInserting entity aliases...');
    const aliasRows = altRows
      .map((r) => [
        toInt(r.alt_num),
        toInt(r.ent_num),
        cleanField(r.alt_type),
        cleanField(r.alt_name),
        cleanField(r.alt_remarks),
      ])
      .filter(
        (r) =>
          r[0] !== null &&
          r[1] !== null &&
          r[3] !== null &&
          validEntNums.has(r[1] as number)
      );

    const orphanedAliases = altRows.length - aliasRows.length;
    if (orphanedAliases > 0) {
      console.log(`  Skipped ${orphanedAliases} alias rows (orphaned or missing required fields)`);
    }

    const aliasesInserted = await batchInsert(
      client,
      'entity_aliases',
      ['alt_num', 'ent_num', 'alt_type', 'alt_name', 'alt_remarks'],
      aliasRows
    );

    // 5. Insert addresses (only those linked to valid entities)
    console.log('\nInserting entity addresses...');
    const addressRows = addRows
      .map((r) => [
        toInt(r.add_num),
        toInt(r.ent_num),
        cleanField(r.address),
        cleanField(r.city_state_zip),
        cleanField(r.country),
        cleanField(r.add_remarks),
      ])
      .filter(
        (r) =>
          r[0] !== null &&
          r[1] !== null &&
          validEntNums.has(r[1] as number)
      );

    const orphanedAddresses = addRows.length - addressRows.length;
    if (orphanedAddresses > 0) {
      console.log(`  Skipped ${orphanedAddresses} address rows (orphaned or missing required fields)`);
    }

    const addressesInserted = await batchInsert(
      client,
      'entity_addresses',
      ['add_num', 'ent_num', 'address', 'city_state_zip', 'country', 'add_remarks'],
      addressRows
    );

    // 6. Refresh the materialized view so search picks up the new data
    console.log('\nRefreshing searchable_names materialized view...');
    await client.query('REFRESH MATERIALIZED VIEW searchable_names');
    console.log('✓ Materialized view refreshed');

    // 7. Mark the run as completed
    await client.query(
      `UPDATE ingestion_runs
       SET status = 'completed', completed_at = NOW(),
           entities_count = $1, aliases_count = $2, addresses_count = $3
       WHERE run_id = $4`,
      [entitiesInserted, aliasesInserted, addressesInserted, runId]
    );

    console.log('\n========================================');
    console.log('✓ Ingestion complete!');
    console.log(`  Entities:  ${entitiesInserted.toLocaleString()}`);
    console.log(`  Aliases:   ${aliasesInserted.toLocaleString()}`);
    console.log(`  Addresses: ${addressesInserted.toLocaleString()}`);
    console.log(`  Run ID:    ${runId}`);
    console.log('========================================');
  } catch (error) {
    // Record the failure so we can debug later
    await client.query(
      `UPDATE ingestion_runs SET status = 'failed', completed_at = NOW(), notes = $1 WHERE run_id = $2`,
      [String(error), runId]
    );
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\n✗ Ingestion failed:', err);
  process.exit(1);
});
