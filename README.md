# Sanctions Screener

A fuzzy-matching web tool for screening names against the U.S. Treasury OFAC Specially Designated Nationals (SDN) list. Built for compliance / KYB / KYC workflows where exact-string matching misses misspellings, transliteration variants (e.g. *Mohammed* / *Muhammad*), and partial aliases.

## What it does

A user types a person's or entity's name. The tool returns ranked candidate matches from ~12,000 sanctioned entities and ~18,000 aliases, each scored on a tunable 0–1 confidence scale and bucketed into four match tiers: **strong / probable / weak / noise**.

Scoring combines three signals in PostgreSQL:

```text
weighted_score = primary_name_similarity × 0.40
               + best_alias_similarity   × 0.40
               + phonetic_match          × 0.20
```

- **Levenshtein similarity** — `1 − (edit_distance / max_length)`, normalized 0–1. Catches typos, missing letters, and transposed characters.
- **Best alias similarity** — same calculation applied across every known alias of the candidate; the highest wins.
- **Phonetic match** — tokenized Soundex, applied per-word, so transliteration variants line up even when Levenshtein gives them mediocre scores.
- **Substring containment** — acts as a floor (≥ 0.60) so a clean substring hit never gets buried.

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
                                                       │
                                                       ▼
                                          Next.js  /api/screen  →  UI
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
