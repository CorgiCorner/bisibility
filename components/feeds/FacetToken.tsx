"use client";

import type { FeedFacet, FeedRowMetadata } from "@/lib/feeds/facets";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";

export function FacetToken({
  facet,
  label,
  onRemove,
}: Readonly<{
  facet: FeedFacet;
  label: string;
  onRemove: (facet: FeedFacet) => void;
}>) {
  return (
    <button
      aria-label={`Remove ${facet.axis}: ${label}`}
      className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border-control bg-bg-elev px-2.5 font-sans tabular-nums text-[11px] text-fg transition-colors hover:border-accent hover:text-accent-text focus-visible:border-accent focus-visible:outline-none"
      onClick={() => onRemove(facet)}
      type="button"
    >
      <span className="text-fg-muted">{facet.axis}</span>
      <span className="font-semibold">{label}</span>
      <X aria-hidden size={12} weight="regular" />
    </button>
  );
}

export function FeedMetadataTokens({
  device,
  metadata,
}: Readonly<{ device?: string; metadata?: FeedRowMetadata }>) {
  if (!metadata) return null;
  const tokens = [
    metadata.source ? ["source", metadata.source] : null,
    metadata.market ? ["market", metadata.market.label] : null,
    metadata.language ? ["language", metadata.language] : null,
    metadata.engine ? ["engine", metadata.engine] : null,
    metadata.severity
      ? ["severity", metadata.severity[0].toUpperCase() + metadata.severity.slice(1)]
      : null,
    device ? ["device", device] : null,
  ].filter((token): token is [string, string] => Boolean(token));
  if (!tokens.length) return null;

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      {tokens.map(([axis, label]) => (
        <span
          className="inline-flex max-w-full items-center truncate rounded-full border border-border bg-bg-sunken px-2 py-0.5"
          data-feed-metadata-axis={axis}
          key={`${axis}:${label}`}
        >
          {label}
        </span>
      ))}
    </span>
  );
}
