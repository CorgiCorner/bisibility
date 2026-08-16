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
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src && src !== failedSrc) {
    return (
      // biome-ignore lint/performance/noImgElement: Avatar URLs use arbitrary hosts unsupported by the image optimizer.
      <img
        alt={alt}
        className={cn("object-cover", className)}
        onError={() => setFailedSrc(src)}
        src={src}
      />
    );
  }

  return <span className={cn("grid place-items-center", className)}>{initials}</span>;
}
