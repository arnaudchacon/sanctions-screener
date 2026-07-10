export function Footer() {
  return (
    <footer className="border-t border-border py-8 px-6 no-print">
      <div className="max-w-[1100px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <p className="text-[12px] text-text-tertiary">
          Built by{' '}
          <a
            href="https://www.linkedin.com/in/arnaud-chacon/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-secondary hover:text-text-primary transition-colors duration-150"
          >
            Arnaud Chacon
          </a>
          {' · '}
          <a
            href="mailto:arnaudchacon@gmail.com"
            className="text-text-secondary hover:text-text-primary transition-colors duration-150"
          >
            arnaudchacon@gmail.com
          </a>
        </p>
        <p className="text-[12px] text-text-tertiary max-w-[520px]">
          Demonstration tool — heuristic ranking over public OFAC data, not a substitute for
          production screening software. Confirm any hit against the official OFAC entry.
        </p>
      </div>
    </footer>
  );
}
