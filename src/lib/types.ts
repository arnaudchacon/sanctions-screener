// src/lib/types.ts — shared client-side types.

export type MatchTier = 'strong' | 'probable' | 'weak' | 'noise';

export type Match = {
  ent_num: number;
  sdn_name: string;
  sdn_type: string | null;
  program: string | null;
  primary_name_score: number;
  best_alias_score: number;
  best_alias_name: string | null;
  phonetic_score: number;
  weighted_score: number;
  match_tier: MatchTier;
};

export type ScreenResponse = {
  query: string;
  min_score: number;
  max_results: number;
  program: string | null;
  match_count: number;
  matches: Match[];
};

export type BatchRow = {
  name: string;
  match_count: number;
  top_tier: MatchTier | null;
  matches: Match[]; // top matches for this name
};

export type BatchResponse = {
  screened: number;
  min_score: number;
  program: string | null;
  rows: BatchRow[];
};

export type Stats = { entity_count: number; last_refreshed: string | null };
export type Program = { code: string; count: number };

export const TIER_ORDER: Record<MatchTier, number> = { strong: 0, probable: 1, weak: 2, noise: 3 };
