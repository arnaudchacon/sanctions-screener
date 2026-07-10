# Sentinel — Sanctions Screener

A fuzzy-matching web tool for screening names against the U.S. Treasury OFAC Specially Designated Nationals (SDN) list. Built for compliance / KYB / KYC workflows where exact-string matching misses misspellings, transliteration variants (e.g. *Mohammed* / *Muhammad*), reversed word order, and partial aliases.

Shares a design system with [HubSpot Health Check](https://github.com/arnaudchacon/hubspot-audit) — same warm-paper surfaces, ink actions, and serif display type across both tools.

## What it does

- **Single-name screening** — type a name, get ranked candidates from ~19,000 sanctioned entities and ~20,000 aliases, each scored 0–1 and bucketed into **strong / probable / weak / noise** tiers, with a full per-signal score decomposition.
- **Batch screening** — paste up to 100 names (or upload a CSV) and screen the whole list in one run: per-name top hit, tier summary (flagged / to review / clear), expandable candidates, batch CSV export.
- **Adjudication** — every hit takes an analyst disposition (confirm / clear as false positive / escalate), stored in the browser and exportable as an audit-log CSV. A print stylesheet turns any result set into a screening report PDF.

## Scoring (v3)

Scoring runs in PostgreSQL (`sql/001_screen_name_v3.sql` + `002…perf.sql`):

```text
weighted_score = primary_name_score × 0.40
               + best_known_name    × 0.40
               + phonetic_match     × 0.20
```

Each name is scored three ways and the best wins:

- **Levenshtein similarity** — `1 − (edit_distance / max_length)`, normalized 0–1. Catches typos, missing letters, transposed characters.
- **Token-set similarity** — every query token is matched to its best counterpart among the name's tokens, with a coverage factor. This is what makes *"Vladimir Putin"* find *"PUTIN, Vladimir Vladimirovich"* (OFAC stores individuals as `LAST, First`) — full-string edit distance alone buried it below unrelated Vladimirs.
- **Substring containment** — a ≥ 0.60 floor so a clean substring hit never gets buried.

Plus **tokenized Soundex** as the phonetic signal, and the same scoring applied across every alias — the *best known name* fills the alias slot (falling back to the primary name), so an entity with no aliases isn't capped below the strong tier.

Candidate recall uses three indexed trigram probes (raw name, containment, and a token-sorted expression index), bounded to the top 400 candidates by cheap similarity before full scoring — queries run in ~100–800 ms. A regression harness (`scripts/eval-scoring.ts`) pins the behavior.

The user-tunable threshold reflects a deliberate design call: false positives erode operator trust faster than missed matches, so the human decides where to cut.

## Tech stack

| Layer          | Technology                                       |
| -------------- | ------------------------------------------------ |
| Frontend       | Next.js (App Router), TypeScript, Tailwind       |
| Database       | Supabase (managed PostgreSQL)                    |
| Fuzzy matching | `fuzzystrmatch` + `pg_trgm` Postgres extensions  |
| Hosting        | Vercel                                           |
| Data source    | OFAC SDN list (public domain CSV files)          |

The scoring logic lives in a Postgres function (`screen_name`), not in TypeScript — it's faster, encapsulated, and directly inspectable from the SQL editor.

## Architecture

```text
OFAC CSV files  →  scripts/ingest.ts  →  Supabase
                                          ├── sanctioned_entities
                                          ├── entity_aliases
                                          ├── entity_addresses
                                          ├── ingestion_runs
                                          └── searchable_names (materialized view)
                                                       │
                                                       ▼
                                               screen_name() SQL function
                                              (sql/*.sql via scripts/apply-sql.ts)
                                                       │
                                                       ▼
                              Next.js  /api/screen · /api/screen-batch  →  UI
```

SQL changes are versioned in `sql/` and applied with:

```bash
npx tsx scripts/apply-sql.ts sql/001_screen_name_v3.sql
npx tsx scripts/apply-sql.ts sql/002_screen_name_v3_perf.sql
```

## Local development

### Prerequisites

- Node.js 18.17 or higher
- A Supabase project with `fuzzystrmatch` and `pg_trgm` extensions enabled, plus the schema (entities, aliases, addresses, ingestion_runs, searchable_names materialized view) and the `screen_name()` function

### Setup

```bash
git clone <this-repo>
cd sanctions-screener
npm install
cp .env.example .env.local
# Fill in your Supabase values in .env.local
```

Download the OFAC SDN files into `data/raw/` from <https://ofac.treasury.gov/sanctions-list-service>:

- `SDN.CSV` (primary entities)
- `ALT.CSV` (strong aliases)
- `ADD.CSV` (addresses)

### Load the data

```bash
npm run ingest
```

This truncates existing rows and reloads from CSV, then refreshes the `searchable_names` materialized view. Safe to re-run.

### Run the dev server

```bash
npm run dev
```

Open <http://localhost:3000>.

### Try the API directly

```bash
curl -X POST http://localhost:3000/api/screen \
  -H "Content-Type: application/json" \
  -d '{"query": "Mohammed", "min_score": 0.5, "max_results": 10}'
```

## Deployment

This project deploys cleanly to Vercel via GitHub. After connecting the repo:

1. Set the four environment variables from `.env.example` in the Vercel project settings.
2. Deploy.

The `scripts/` folder runs locally only — Vercel ignores it.

## Disclaimer

This is a demonstration of fuzzy-matching methodology for portfolio purposes. It is **not** a substitute for production sanctions-screening software. OFAC's published list is authoritative; this tool's scoring is heuristic and tuned for ranking, not for legal determinations. Always confirm any positive match against the original OFAC entry before taking action.

## License

MIT.
