"use client";

import { cn } from "@/lib/ui/cn";
import { useState } from "react";

export type AvatarProps = {
  /** Decorative alt text for the image variant; use "" when the name is shown alongside. */
  alt: string;
  /** Shared sizing, radius, background, and font classes for both image and initials variants. */
  className: string;
  initials: string;
  /** Server-derived avatar URL (e.g. Gravatar). When null/empty or on load error, initials are shown. */
  src?: string | null;
};

export function Avatar({ alt, className, initials, src }: Readonly<AvatarProps>) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const canLoad = Boolean(src && src !== failedSrc);
  const imageReady = canLoad && src === loadedSrc;

  if (imageReady) {
    return (
      // biome-ignore lint/performance/noImgElement: Avatar URLs use arbitrary hosts unsupported by the image optimizer.
      <img alt={alt} className={cn("object-cover", className)} src={src ?? undefined} />
    );
  }

  return (
    <span
      aria-hidden={alt ? undefined : true}
      className={cn("relative grid place-items-center", className)}
    >
      {initials}
      {canLoad ? (
        // Preload off-screen so a missing Gravatar never flashes the broken-image glyph.
        // biome-ignore lint/performance/noImgElement: Avatar URLs use arbitrary hosts unsupported by the image optimizer.
        <img
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-0"
          onError={() => setFailedSrc(src ?? null)}
          onLoad={() => setLoadedSrc(src ?? null)}
          src={src ?? undefined}
        />
      ) : null}
    </span>
  );
}
