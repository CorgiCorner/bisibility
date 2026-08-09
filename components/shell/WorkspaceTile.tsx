"use client";

import { buildLogoDevUrl } from "@/components/ui";

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
 * A workspace is a domain, so the tile shows that domain's favicon and the SAME object
 * appears in the trigger and in every menu row. It never encodes selected/active state.
 */
export function WorkspaceTile({
  className = "",
  domain,
  radius = 8,
}: Readonly<WorkspaceTileProps>) {
  const src = buildLogoDevUrl({ domain, size: 64, token: process.env.NEXT_PUBLIC_LOGODEV_TOKEN });

  return (
    <span
      aria-hidden
      className={`relative grid h-7 w-7 flex-none place-items-center overflow-hidden border border-border-strong bg-bg-sunken font-mono text-[12px] font-semibold leading-none text-fg-muted ${className}`}
      style={{ borderRadius: `${radius}px` }}
    >
      {workspaceTileLetter(domain)}
      {/* The favicon is a background layer, not an <img>. An <img> with a missing or dead URL
          renders a broken-image glyph; an unresolved background-image simply does not paint,
          so the letter underneath stays correct. */}
      {src ? (
        <span
          className="absolute inset-0"
          data-testid="workspace-tile-favicon"
          style={{
            backgroundImage: `url("${src}")`,
            backgroundPosition: "center",
            backgroundSize: "cover",
          }}
        />
      ) : null}
    </span>
  );
}
