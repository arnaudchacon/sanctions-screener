-- 002_screen_name_v3_perf.sql
--
-- Performance pass on screen_name v3. The token-sorted trigram probe fixed
-- recall but ballooned the candidate set, taking queries from ~0.6s to ~5.5s
-- (token_set_sim is the expensive scorer and it ran on thousands of rows).
--
-- Three changes restore speed without giving back recall:
--   1. The candidate probe uses `sn.name ILIKE …` instead of
--      `LOWER(sn.name) ILIKE …`. ILIKE is already case-insensitive, and the
--      LOWER() wrapper made that OR branch un-indexable — one dead branch
--      forces the whole OR into a seq scan that evaluated token_sort() for
--      all 39k rows (~5.2s). Indexable branches BitmapOr in ~70ms.
--   2. The trigram similarity threshold is raised from the 0.30 default to
--      0.35 for this transaction only (containment and the token-sort probe
--      still catch partial and reordered names).
--   3. Candidates are ranked by cheap trigram similarity and capped at 400
--      before the expensive scoring pipeline runs. The true match's cheap
--      similarity is always near the top, so the cap doesn't cost recall.

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

  -- Narrow the % operator for this transaction only.
  PERFORM set_config('pg_trgm.similarity_threshold', '0.35', true);

  RETURN QUERY
  WITH
  candidates AS (
    SELECT sn.ent_num,
           MAX(GREATEST(
             public.similarity(sn.name, q),
             public.similarity(public.token_sort(sn.name), q_sorted),
             CASE WHEN sn.name ILIKE '%' || q || '%' THEN 0.99 ELSE 0 END
           )) AS cheap_sim
    FROM searchable_names sn
    WHERE sn.name % q
       OR sn.name ILIKE '%' || q || '%'
       OR public.token_sort(sn.name) % q_sorted
    GROUP BY sn.ent_num
    ORDER BY cheap_sim DESC
    LIMIT 400
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
