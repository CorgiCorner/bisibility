import { buildDomainIconUrl, DomainIconLayer } from "@/components/ui";

export type CompetitorTileProps = {
  domain: string;
  initials: string;
};

/**
 * Shows the competitor's real favicon while preserving its initials as a durable fallback.
 * The favicon is a background layer, so an unresolved background does not paint or show a
 * broken-image glyph and leaves the initials for missing or corporate-blocked icon networks.
 */
export function CompetitorTile({ domain, initials }: Readonly<CompetitorTileProps>) {
  const src = buildDomainIconUrl({ domain, size: 64 });

  return (
    <span className="relative grid h-[30px] w-[30px] shrink-0 place-items-center overflow-hidden rounded-lg bg-bg-sunken font-mono text-[11px] font-semibold text-fg-muted">
      {initials}
      <DomainIconLayer size={64} src={src} testId="competitor-tile-favicon" />
    </span>
  );
}
