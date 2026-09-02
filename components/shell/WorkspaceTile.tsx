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
  /** Corner radius in px. */
  radius?: number;
  /** The compact sidebar switcher uses a 20px tile; menu rows retain 28px. */
  size?: 20 | 28;
};

/**
 * A project is identified by its domain, so the tile shows its real favicon and the SAME object
 * appears in the trigger and in every menu row. Its fixed white surface keeps transparent
 * favicon pixels from revealing the fallback glyph in either color scheme. It never encodes
 * selected/active state.
 */
export function WorkspaceTile({
  className = "",
  domain,
  radius = 8,
  size = 28,
}: Readonly<WorkspaceTileProps>) {
  const src = buildDomainIconUrl({ domain, size: 64 });

  return (
    <span
      aria-hidden
      className={`relative grid flex-none place-items-center overflow-hidden border border-border-strong bg-white font-semibold leading-none text-neutral-800 ${size === 20 ? "h-5 w-5 text-[9px]" : "h-7 w-7 text-[12px]"} ${className}`}
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
