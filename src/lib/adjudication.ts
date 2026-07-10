// src/lib/adjudication.ts
//
// Analyst dispositions for screening hits, persisted in the browser only.
// A disposition answers: "an operator looked at this hit for this query —
// what did they decide?" The exported audit log is built from this store.

export type Disposition = 'confirmed' | 'cleared' | 'escalated';

export interface DispositionRecord {
  query: string;
  ent_num: number;
  sdn_name: string;
  program: string | null;
  weighted_score: number;
  match_tier: string;
  disposition: Disposition;
  decided_at: string; // ISO
}

const STORAGE_KEY = 'sentinel.dispositions.v1';

function keyOf(query: string, entNum: number): string {
  return `${query.trim().toLowerCase()}::${entNum}`;
}

function readAll(): Record<string, DispositionRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, DispositionRecord>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage full or unavailable — dispositions stay in memory for the session.
  }
}

export function getDisposition(query: string, entNum: number): DispositionRecord | null {
  return readAll()[keyOf(query, entNum)] ?? null;
}

export function setDisposition(record: Omit<DispositionRecord, 'decided_at'>): DispositionRecord {
  const map = readAll();
  const full: DispositionRecord = { ...record, decided_at: new Date().toISOString() };
  map[keyOf(record.query, record.ent_num)] = full;
  writeAll(map);
  return full;
}

export function clearDisposition(query: string, entNum: number) {
  const map = readAll();
  delete map[keyOf(query, entNum)];
  writeAll(map);
}

export function listDispositions(): DispositionRecord[] {
  return Object.values(readAll()).sort(
    (a, b) => new Date(b.decided_at).getTime() - new Date(a.decided_at).getTime()
  );
}
