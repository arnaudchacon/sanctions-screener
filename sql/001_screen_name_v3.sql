-- 001_screen_name_v3.sql
--
-- Scoring v3 — fixes three defects found in the v2 eval (scripts/eval-scoring.ts):
--
--   1. Word order. OFAC stores individuals as "LAST, First" so a query in
--      natural order ("Vladimir Putin") scored ~0.45 against "PUTIN, Vladimir
--      Vladimirovich" and lost to irrelevant Vladimirs. v3 adds token-set
--      similarity: each query token is matched to its best name token, so
--      word order and middle names stop mattering.
--   2. Exact-match ceiling. The alias slot used COALESCE(best_alias, 0), so a
--      perfect primary match with a mediocre alias capped at ~0.82, and an
--      entity with no aliases could never exceed 0.60. v3 lets the alias slot
--      fall back to the primary score — the primary name is itself a "known
--      name" of the entity.
--   3. Candidate recall. Trigram + containment prefilter missed reordered
--      names entirely. v3 adds a token-sorted trigram probe (with a matching
--      expression index) so "putin vladimir" finds "PUTIN, Vladimir ...".
--
-- Function signature and return shape are unchanged — the API and UI need no
-- migration. Tier thresholds and the 0.40/0.40/0.20 weights are unchanged.

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- All internal calls are schema-qualified (public.*): functions evaluated in
-- index expressions run with search_path restricted to pg_catalog, so
-- unqualified references fail during CREATE INDEX / REFRESH MATERIALIZED VIEW.

-- Normalized Levenshtein similarity, 0–1, safe for long/empty strings.
CREATE OR REPLACE FUNCTION lev_sim(a TEXT, b TEXT)
RETURNS FLOAT
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN a IS NULL OR b IS NULL THEN 0.0
    WHEN LENGTH(a) = 0 OR LENGTH(b) = 0 THEN 0.0
    ELSE GREATEST(
      0.0,
      1.0 - public.levenshtein(SUBSTRING(a FROM 1 FOR 255), SUBSTRING(b FROM 1 FOR 255))::FLOAT
          / GREATEST(LENGTH(SUBSTRING(a FROM 1 FOR 255)), LENGTH(SUBSTRING(b FROM 1 FOR 255)))::FLOAT
    )
  END
$$;

-- Lowercased alphanumeric tokens of a name.
CREATE OR REPLACE FUNCTION norm_tokens(t TEXT)
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT ARRAY(
    SELECT w
    FROM unnest(regexp_split_to_array(LOWER(COALESCE(t, '')), '[^a-z0-9]+')) AS w
    WHERE LENGTH(w) > 0
  )
$$;

-- Tokens sorted and rejoined — "PUTIN, Vladimir" and "Vladimir Putin" both
-- become "putin vladimir". Used for the candidate trigram probe.
CREATE OR REPLACE FUNCTION token_sort(t TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT array_to_string(ARRAY(SELECT w FROM unnest(public.norm_tokens(t)) AS w ORDER BY w), ' ')
$$;

-- Token-set similarity: average, over query tokens, of each token's best
-- Levenshtein similarity among the name's tokens — order-insensitive and
-- tolerant of extra name tokens (middle names, patronymics). A coverage
-- factor keeps a 1-token query against a 4-token name from scoring like a
-- full match: score × (0.7 + 0.3 × |query tokens| / |name tokens|, capped).
CREATE OR REPLACE FUNCTION token_set_sim(query_text TEXT, name_text TEXT)
RETURNS FLOAT
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  WITH qt AS (SELECT unnest(public.norm_tokens(query_text)) AS tok),
       nt AS (SELECT unnest(public.norm_tokens(name_text)) AS tok),
       per_q AS (
         SELECT (SELECT COALESCE(MAX(public.lev_sim(qt.tok, nt.tok)), 0) FROM nt) AS best
         FROM qt
       )
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM qt) = 0 OR (SELECT COUNT(*) FROM nt) = 0 THEN 0.0
    ELSE (SELECT AVG(best) FROM per_q)
         * (0.7 + 0.3 * LEAST(1.0, (SELECT COUNT(*) FROM qt)::FLOAT / (SELECT COUNT(*) FROM nt)::FLOAT))
  END
$$;

-- Combined per-name score: best of full-string similarity, token-set
-- similarity, and the 0.60 substring-containment floor.
CREATE OR REPLACE FUNCTION name_score(q TEXT, name_text TEXT)
RETURNS FLOAT
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT GREATEST(
    public.lev_sim(LOWER(name_text), q),
    public.token_set_sim(q, name_text),
    CASE WHEN LOWER(name_text) ILIKE '%' || q || '%' THEN 0.6 ELSE 0.0 END
  )
$$;

-- Expression index so the token-sorted trigram probe stays indexed.
-- (Indexes on materialized views survive REFRESH MATERIALIZED VIEW.)
CREATE INDEX IF NOT EXISTS idx_searchable_token_sort_trgm
  ON searchable_names USING gin (public.token_sort(name) public.gin_trgm_ops);

-- ── screen_name v3 ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION screen_name(
  query_name TEXT,
  min_score FLOAT DEFAULT 0.5,
  max_results INT DEFAULT 20,
  program_filter TEXT DEFAULT NULL
)
RETURNS TABLE(
  ent_num INTEGER,
  sdn_name TEXT,
  sdn_type TEXT,
  program TEXT,
  primary_name_score FLOAT,
  best_alias_score FLOAT,
  best_alias_name TEXT,
  phonetic_score FLOAT,
  weighted_score FLOAT,
  match_tier TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
#variable_conflict use_column
DECLARE
  q TEXT;
  q_sorted TEXT;
  q_len INT;
BEGIN
  q := LOWER(TRIM(query_name));
  q_len := LENGTH(q);

  IF q_len = 0 THEN
    RETURN;
  END IF;

  IF q_len > 255 THEN
    q := SUBSTRING(q FROM 1 FOR 255);
  END IF;

  q_sorted := public.token_sort(q);

  RETURN QUERY
  WITH
  candidates AS (
    SELECT DISTINCT sn.ent_num
    FROM searchable_names sn
    WHERE sn.name % q
       OR LOWER(sn.name) ILIKE '%' || q || '%'
       OR public.token_sort(sn.name) % q_sorted
  ),
  primary_scored AS (
    SELECT
      e.ent_num,
      e.sdn_name,
      e.sdn_type,
      e.program,
      public.name_score(q, e.sdn_name) AS primary_score,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM unnest(public.norm_tokens(e.sdn_name)) AS name_word
          CROSS JOIN unnest(public.norm_tokens(q)) AS query_word
          WHERE LENGTH(name_word) >= 3
            AND LENGTH(query_word) >= 3
            AND public.soundex(name_word) = public.soundex(query_word)
        ) THEN 1.0
        ELSE 0.0
      END AS primary_phonetic
    FROM candidates c
    JOIN sanctioned_entities e ON c.ent_num = e.ent_num
    WHERE program_filter IS NULL OR e.program = program_filter
  ),
  alias_scored AS (
    SELECT
      a.ent_num,
      a.alt_name,
      public.name_score(q, a.alt_name) AS alias_score,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM unnest(public.norm_tokens(a.alt_name)) AS name_word
          CROSS JOIN unnest(public.norm_tokens(q)) AS query_word
          WHERE LENGTH(name_word) >= 3
            AND LENGTH(query_word) >= 3
            AND public.soundex(name_word) = public.soundex(query_word)
        ) THEN 1.0
        ELSE 0.0
      END AS alias_phonetic
    FROM entity_aliases a
    WHERE a.ent_num IN (SELECT c.ent_num FROM candidates c)
  ),
  best_alias AS (
    SELECT DISTINCT ON (a.ent_num)
      a.ent_num,
      a.alt_name AS best_name,
      a.alias_score AS best_score,
      a.alias_phonetic AS best_phonetic
    FROM alias_scored a
    ORDER BY a.ent_num, a.alias_score DESC, a.alias_phonetic DESC
  ),
  final AS (
    SELECT
      p.ent_num,
      p.sdn_name,
      p.sdn_type,
      p.program,
      p.primary_score,
      -- v3: the alias slot falls back to the primary score — the primary name
      -- is itself a known name, so a missing/mediocre alias must not drag a
      -- perfect primary match down.
      GREATEST(COALESCE(ba.best_score, 0), p.primary_score) AS alias_slot,
      CASE
        WHEN COALESCE(ba.best_score, 0) >= p.primary_score THEN ba.best_name
        ELSE NULL
      END AS best_alias_name,
      CASE
        WHEN p.primary_phonetic = 1.0 THEN 1.0
        WHEN COALESCE(ba.best_phonetic, 0) = 1.0 THEN 0.8
        ELSE 0.0
      END AS phonetic_score
    FROM primary_scored p
    LEFT JOIN best_alias ba ON p.ent_num = ba.ent_num
  )
  SELECT
    f.ent_num,
    f.sdn_name,
    f.sdn_type,
    f.program,
    f.primary_score::FLOAT AS primary_name_score,
    f.alias_slot::FLOAT AS best_alias_score,
    f.best_alias_name,
    f.phonetic_score::FLOAT AS phonetic_score,
    (f.primary_score * 0.40 + f.alias_slot * 0.40 + f.phonetic_score * 0.20)::FLOAT AS weighted_score,
    CASE
      WHEN (f.primary_score * 0.40 + f.alias_slot * 0.40 + f.phonetic_score * 0.20) >= 0.80 THEN 'strong'
      WHEN (f.primary_score * 0.40 + f.alias_slot * 0.40 + f.phonetic_score * 0.20) >= 0.65 THEN 'probable'
      WHEN (f.primary_score * 0.40 + f.alias_slot * 0.40 + f.phonetic_score * 0.20) >= 0.40 THEN 'weak'
      ELSE 'noise'
    END AS match_tier
  FROM final f
  WHERE (f.primary_score * 0.40 + f.alias_slot * 0.40 + f.phonetic_score * 0.20) >= min_score
  ORDER BY weighted_score DESC
  LIMIT max_results;
END;
$$;

GRANT EXECUTE ON FUNCTION screen_name(TEXT, FLOAT, INT, TEXT) TO anon, authenticated, service_role;
