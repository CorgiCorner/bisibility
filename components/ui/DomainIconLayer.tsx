"use client";

import { useCallback, useRef, useState } from "react";

export type DomainIconLayerProps = {
  size?: number;
  src?: string | null;
  testId?: string;
};

const MIN_ICON_DIMENSION = 32;

/**
 * Reports whether a probe image resolved to a square icon at least as large as
 * the minimum dimension. Shared by the ref recovery and the load handler.
 */
function isProbeValid(img: HTMLImageElement) {
  return (
    img.naturalWidth === img.naturalHeight &&
    img.naturalWidth >= MIN_ICON_DIMENSION &&
    img.naturalHeight >= MIN_ICON_DIMENSION
  );
}

/**
 * Paints a verified domain icon as a background, leaving the caller's text fallback visible
 * when the icon service resolves to a smaller placeholder or an error.
 */
export function DomainIconLayer({ src, testId }: Readonly<DomainIconLayerProps>) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const verifiedSrc = loadedSrc === src ? src : null;
  const srcRef = useRef(src);
  srcRef.current = src;

  const probeRef = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && isProbeValid(img)) {
      setLoadedSrc(srcRef.current ?? null);
    }
  }, []);

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
            if (isProbeValid(event.currentTarget)) {
              setLoadedSrc(src);
              return;
            }
            setLoadedSrc((current) => (current === src ? null : current));
          }}
          ref={probeRef}
          src={src}
          width={1}
        />
      }
      {verifiedSrc ? (
        <span
          className="absolute inset-0 opacity-100 starting:opacity-0 transition-opacity duration-[var(--motion-tooltip)] ease-[ease] motion-reduce:transition-none"
          data-testid={testId}
          style={{
            backgroundColor: "var(--bg-sunken)",
            backgroundImage: `url("${verifiedSrc}")`,
            backgroundPosition: "center",
            backgroundSize: "cover",
          }}
        />
      ) : null}
    </>
  );
}
