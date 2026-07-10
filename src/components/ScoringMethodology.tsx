export function ScoringMethodology() {
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="eyebrow" style={{ color: 'var(--text-primary)' }}>Scoring methodology</span>
        <span className="eyebrow">token-set levenshtein · soundex · containment</span>
      </div>
      <div className="p-5 grid sm:grid-cols-2 gap-8">
        <div>
          <div className="eyebrow mb-2">Weighted formula</div>
          <div className="font-mono text-[12px] leading-[1.8] text-text-primary">
            <div>primary_name_score × 0.40</div>
            <div>+ best_known_name × 0.40</div>
            <div>+ phonetic_score × 0.20</div>
          </div>
        </div>
        <div>
          <div className="eyebrow mb-2">Tier thresholds</div>
          <div className="font-mono text-[12px] leading-[1.8]">
            <div><span style={{ color: 'var(--tier-strong)' }}>strong</span>{'   '}≥ 0.80</div>
            <div><span style={{ color: 'var(--tier-probable)' }}>probable</span> ≥ 0.65</div>
            <div><span style={{ color: 'var(--tier-weak)' }}>weak</span>{'     '}≥ 0.40</div>
            <div><span style={{ color: 'var(--tier-noise)' }}>noise</span>{'    '}&lt; 0.40</div>
          </div>
        </div>
        <div className="sm:col-span-2 text-[13px] text-text-secondary leading-relaxed pt-2 border-t border-border">
          Each name is scored three ways and the best wins: full-string Levenshtein similarity,
          <strong className="text-text-primary font-medium"> token-set similarity</strong> (every
          query word matched to its best counterpart in the name, so &ldquo;Vladimir Putin&rdquo;
          finds &ldquo;PUTIN, Vladimir Vladimirovich&rdquo; despite the reversed order and extra
          patronymic), and a 0.60 substring-containment floor. Tokenized Soundex flags
          transliteration variants — Mohammed / Muhammad — that edit distance underrates. The
          same scoring runs across every known alias, and the best known name fills the alias
          slot so an entity is never penalized for having few aliases.
        </div>
      </div>
    </div>
  );
}
