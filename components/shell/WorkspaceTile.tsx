"use client";

import { buildDomainIconUrl, DomainIconLayer } from "@/components/ui";

/** Fallback glyph: the brand's first letter, with the host prefix dropped so
 * `www.acme.dev` and `acme.dev` resolve to the same tile. */
export function workspaceTileLetter(domain: string): string {
  const host = domain.trim().replace(/^www\./i, "");
  return (host.at(0) ?? "?").toLowerCase();
}

export type WorkspaceTileProps = {
  /** Extra classes for the caller's state styling; never for selection. */
  className?: string;
  domain: string;
  /** Corner radius in px. 8 everywhere the tile is 28px; the menu and both rail states. */
  radius?: number;
};

/**
 * A project is identified by its domain, so the tile shows its real favicon and the SAME object
 * appears in the trigger and in every menu row. It never encodes selected/active state.
 */
export function WorkspaceTile({
  className = "",
  domain,
  radius = 8,
}: Readonly<WorkspaceTileProps>) {
  const src = buildDomainIconUrl({ domain, size: 64 });

  return (
    <span
      aria-hidden
      className={`relative grid h-7 w-7 flex-none place-items-center overflow-hidden border border-border-strong bg-bg-sunken font-mono text-[12px] font-semibold leading-none text-fg-muted ${className}`}
      style={{ borderRadius: `${radius}px` }}
    >
      {workspaceTileLetter(domain)}
      {/* The painted favicon is a background layer, not a visible <img>. An unresolved background
          does not paint, avoids a broken-image glyph, and leaves the letter for missing or
          corporate-blocked icon networks. */}
      <DomainIconLayer size={64} src={src} testId="workspace-tile-favicon" />
    </span>
  );
}
