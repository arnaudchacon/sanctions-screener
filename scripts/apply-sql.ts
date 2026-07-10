// scripts/apply-sql.ts
//
// Applies a SQL file to the database over the direct Postgres connection,
// one statement at a time. Statement-at-a-time matters: Postgres parse-analyzes
// a multi-statement simple query up front, so a CREATE INDEX referencing a
// function created earlier in the same string fails with "does not exist".
//
// Usage: npx tsx scripts/apply-sql.ts sql/001_screen_name_v3.sql
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { readFileSync } from 'fs';
import { Client } from 'pg';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npx tsx scripts/apply-sql.ts <path-to-sql-file>');
  process.exit(1);
}

// Split SQL on semicolons, but not inside dollar-quoted bodies ($$ … $$ or
// $tag$ … $tag$), single-quoted strings, or line comments.
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let dollarTag: string | null = null;
  let inString = false;
  let inLineComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    current += ch;

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (dollarTag) {
      if (ch === '$' && sql.startsWith(dollarTag, i)) {
        current += sql.slice(i + 1, i + dollarTag.length);
        i += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }
    if (inString) {
      if (ch === "'") inString = false;
      continue;
    }

    if (ch === "'") { inString = true; continue; }
    if (ch === '-' && sql[i + 1] === '-') { inLineComment = true; continue; }
    if (ch === '$') {
      const m = sql.slice(i).match(/^\$[a-zA-Z_]*\$/);
      if (m) {
        dollarTag = m[0];
        current += sql.slice(i + 1, i + dollarTag.length);
        i += dollarTag.length - 1;
        continue;
      }
    }
    if (ch === ';') {
      const stmt = current.trim();
      if (stmt.replace(/;$/, '').replace(/--.*$/gm, '').trim().length > 0) statements.push(stmt);
      current = '';
    }
  }
  const rest = current.trim();
  if (rest.replace(/--.*$/gm, '').trim().length > 0) statements.push(rest);
  return statements;
}

async function main() {
  const sql = readFileSync(resolve(process.cwd(), file), 'utf-8');
  const statements = splitStatements(sql);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    for (const [i, stmt] of statements.entries()) {
      const label = stmt.match(/^(CREATE(?: OR REPLACE)?\s+\w+(?:\s+IF NOT EXISTS)?\s+[\w.()]*|GRANT|DROP\s+\w+|REFRESH[\w\s]*)/i)?.[0]?.trim()
        ?? stmt.slice(0, 60).replace(/\s+/g, ' ');
      process.stdout.write(`[${i + 1}/${statements.length}] ${label} … `);
      await client.query(stmt);
      console.log('ok');
    }
    console.log(`\nApplied ${file} (${statements.length} statements)`);
  } finally {
    await client.end();
  }
}

main().catch((err) => { console.error('\nFailed:', err.message); process.exit(1); });
