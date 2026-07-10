'use client';

// Right-side dossier drawer for one SDN entry: parsed remarks (DOB, POB,
// nationality, …), every alias, every address. Same drawer idiom as the
// Health Check affected-records panel.

import { useEffect, useState } from 'react';

interface Dossier {
  entity: {
    ent_num: number;
    sdn_name: string;
    sdn_type: string | null;
    program: string | null;
    title: string | null;
    remarks: string | null;
  };
  aliases: Array<{ alt_name: string; alt_type: string | null }>;
  addresses: Array<{ address: string | null; city_state_zip: string | null; country: string | null; add_remarks: string | null }>;
}

// OFAC packs structured facts into the free-text remarks field as
// "; "-separated clauses: "DOB 07 Oct 1952; POB Leningrad, Russia; …".
// Pull out the recognizable ones as labeled fields, keep the rest as notes.
const FACT_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'Date of birth', re: /^DOB (.+)$/i },
  { label: 'Place of birth', re: /^POB (.+)$/i },
  { label: 'Nationality', re: /^nationality (.+)$/i },
  { label: 'Citizenship', re: /^citizen (.+)$/i },
  { label: 'Gender', re: /^Gender (.+)$/i },
  { label: 'Passport', re: /^Passport (.+)$/i },
  { label: 'National ID', re: /^National ID No\.? (.+)$/i },
  { label: 'Tax ID', re: /^Tax ID No\.? (.+)$/i },
  { label: 'Registration', re: /^Registration Number (.+)$/i },
  { label: 'Website', re: /^Website (.+)$/i },
  { label: 'Email', re: /^Email Address (.+)$/i },
];

function parseRemarks(remarks: string | null): { facts: Array<{ label: string; value: string }>; notes: string[] } {
  if (!remarks) return { facts: [], notes: [] };
  const clauses = remarks.split(/;\s*/).map((c) => c.trim().replace(/\.$/, '')).filter(Boolean);
  const facts: Array<{ label: string; value: string }> = [];
  const notes: string[] = [];
  for (const clause of clauses) {
    const hit = FACT_PATTERNS.find((p) => p.re.test(clause));
    if (hit) facts.push({ label: hit.label, value: clause.match(hit.re)![1] });
    else notes.push(clause);
  }
  return { facts, notes };
}

export function EntityDossier({
  entNum,
  onClose,
}: {
  entNum: number | null;
  onClose: () => void;
}) {
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [error, setError] = useState(false);
  const isOpen = entNum !== null;

  useEffect(() => {
    if (entNum === null) return;
    setDossier(null);
    setError(false);
    let cancelled = false;
    fetch(`/api/entity/${entNum}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d: Dossier) => { if (!cancelled) setDossier(d); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [entNum]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const parsed = dossier ? parseRemarks(dossier.entity.remarks) : null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 no-print transition-opacity duration-200"
        style={{
          background: 'rgba(26, 22, 20, 0.12)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 h-dvh w-[440px] max-w-full z-50 flex flex-col bg-bg border-l border-border no-print transition-transform duration-200 ease-out"
        style={{
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          boxShadow: isOpen ? '-4px 0 24px rgba(0,0,0,0.07)' : undefined,
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-border shrink-0">
          <div className="min-w-0">
            <p className="eyebrow mb-1" style={{ color: 'var(--accent)' }}>SDN dossier</p>
            {dossier ? (
              <>
                <h2 className="font-serif text-[22px] leading-snug text-text-primary">
                  {dossier.entity.sdn_name}
                </h2>
                <p className="text-[12px] text-text-secondary mt-1">
                  #{dossier.entity.ent_num}
                  {dossier.entity.sdn_type ? ` · ${dossier.entity.sdn_type}` : ''}
                  {dossier.entity.program ? ` · ` : ''}
                  {dossier.entity.program && (
                    <span className="font-mono">{dossier.entity.program}</span>
                  )}
                </p>
                {dossier.entity.title && (
                  <p className="text-[13px] text-text-primary italic mt-1.5">{dossier.entity.title}</p>
                )}
              </>
            ) : (
              <h2 className="font-serif text-[22px] text-text-tertiary">{error ? 'Lookup failed' : 'Loading…'}</h2>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 ml-4 p-1 text-text-tertiary hover:text-text-primary transition-colors duration-150"
            aria-label="Close dossier"
          >
            <svg width="18" height="18" viewBox="0 0 18 18"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">
          {error && (
            <p className="text-[13px] text-text-secondary">Could not load this entity. Try again.</p>
          )}

          {parsed && parsed.facts.length > 0 && (
            <section>
              <div className="eyebrow mb-2.5">Identifiers</div>
              <div className="flex flex-col">
                {parsed.facts.map((f, i) => (
                  <div key={i} className="grid grid-cols-[110px_1fr] gap-3 py-1 text-[12.5px]">
                    <span className="eyebrow text-[10px] pt-0.5">{f.label}</span>
                    <span className="text-text-primary">{f.value}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {dossier && dossier.aliases.length > 0 && (
            <section>
              <div className="eyebrow mb-2.5">Known aliases ({dossier.aliases.length})</div>
              <div className="flex flex-col gap-1">
                {dossier.aliases.map((a, i) => (
                  <div key={i} className="flex items-baseline gap-2 text-[12.5px]">
                    <span className="font-mono text-[10px] text-text-tertiary uppercase w-8">{a.alt_type ?? 'aka'}</span>
                    <span className="text-text-primary">{a.alt_name}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {dossier && dossier.addresses.length > 0 && (
            <section>
              <div className="eyebrow mb-2.5">Addresses ({dossier.addresses.length})</div>
              <div className="flex flex-col gap-2.5">
                {dossier.addresses.map((a, i) => (
                  <div key={i} className="rounded-lg border border-border px-3 py-2 text-[12.5px] text-text-primary">
                    {[a.address, a.city_state_zip, a.country].filter(Boolean).join(', ') || '—'}
                    {a.add_remarks && <div className="text-[11px] text-text-tertiary mt-0.5">{a.add_remarks}</div>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {parsed && parsed.notes.length > 0 && (
            <section>
              <div className="eyebrow mb-2.5">OFAC notes</div>
              <ul className="flex flex-col gap-1.5 list-none m-0 p-0">
                {parsed.notes.map((n, i) => (
                  <li key={i} className="text-[12.5px] text-text-secondary leading-relaxed">— {n}</li>
                ))}
              </ul>
            </section>
          )}

          {dossier && (
            <p className="text-[11px] text-text-tertiary border-t border-border pt-4">
              Source: OFAC SDN list (public domain). Verify against the{' '}
              <a
                href={`https://sanctionssearch.ofac.treas.gov/Details.aspx?id=${dossier.entity.ent_num}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent-hover"
              >
                official OFAC entry
              </a>{' '}
              before acting on a match.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
