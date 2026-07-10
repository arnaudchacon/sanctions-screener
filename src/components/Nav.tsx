export function Nav() {
  return (
    <header className="sticky top-0 z-30 bg-bg/90 backdrop-blur-sm border-b border-border no-print">
      <div className="max-w-[1100px] mx-auto px-6 h-14 flex items-center justify-between">
        <a href="/" className="flex items-baseline gap-2 group">
          <span className="font-serif text-[19px] text-text-primary leading-none">
            Sentinel
          </span>
          <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-text-tertiary group-hover:text-text-secondary transition-colors duration-150">
            sanctions screening
          </span>
        </a>

        <div className="flex items-center gap-5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.08em] text-ok">
            <span className="w-1.5 h-1.5 rounded-full bg-ok pulse" />
            Live · OFAC SDN
          </span>
        </div>
      </div>
    </header>
  );
}
