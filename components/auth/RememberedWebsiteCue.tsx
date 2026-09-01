import { buildDomainIconUrl, DomainIconLayer, domainIconHost } from "@/components/ui";

type RememberedWebsiteCueProps = {
  website: string;
};

function cueLabel(website: string) {
  return domainIconHost(website)?.replace(/^www\./i, "") ?? website;
}

function fallbackLetter(label: string) {
  return label.trim().at(0)?.toLowerCase() ?? "?";
}

export function RememberedWebsiteCue({ website }: Readonly<RememberedWebsiteCueProps>) {
  const label = cueLabel(website);
  const src = buildDomainIconUrl({ domain: website });

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1 text-[11px] text-fg-muted">
      <span className="text-xs">Setting up tracking for</span>
      <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-border bg-bg-elev py-0.5 pr-2 pl-1.5 text-fg">
        <span
          aria-hidden
          className="relative grid size-4 flex-none place-items-center overflow-hidden rounded-[4px] border border-border-strong bg-white font-mono text-[8px] font-semibold leading-none text-neutral-800"
        >
          {fallbackLetter(label)}
          <DomainIconLayer src={src} testId="remembered-website-favicon" />
        </span>
        <span className="min-w-0 max-w-[200px] truncate font-medium" title={label}>
          {label}
        </span>
      </span>
    </div>
  );
}
