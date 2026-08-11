"use client";

import { useState } from "react";

export type DomainIconLayerProps = {
  size?: number;
  src?: string | null;
  testId?: string;
};

/**
 * Paints a verified domain icon as a background, leaving the caller's text fallback visible
 * when the icon service resolves to a smaller placeholder or an error.
 */
export function DomainIconLayer({ size = 64, src, testId }: Readonly<DomainIconLayerProps>) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const verifiedSrc = loadedSrc === src ? src : null;

  if (!src) {
    return null;
  }

  return (
    <>
      {/* This transparent probe is never visible. The painted icon remains a CSS background. */}
      {
        // biome-ignore lint/performance/noImgElement: The probe needs the remote image's natural dimensions before painting a CSS background.
        <img
          alt=""
          aria-hidden
          className="pointer-events-none absolute h-px w-px opacity-0"
          data-testid={testId ? `${testId}-probe` : undefined}
          decoding="async"
          height={1}
          onError={() => setLoadedSrc((current) => (current === src ? null : current))}
          onLoad={(event) => {
            const { naturalHeight, naturalWidth } = event.currentTarget;
            if (naturalHeight === size && naturalWidth === size) {
              setLoadedSrc(src);
              return;
            }
            setLoadedSrc((current) => (current === src ? null : current));
          }}
          src={src}
          width={1}
        />
      }
      {verifiedSrc ? (
        <span
          className="absolute inset-0"
          data-testid={testId}
          style={{
            backgroundImage: `url("${verifiedSrc}")`,
            backgroundPosition: "center",
            backgroundSize: "cover",
          }}
        />
      ) : null}
    </>
  );
}
