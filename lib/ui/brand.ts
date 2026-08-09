// Geometry for the brand mark and the mark/wordmark lockup. It lives in lib because the
// Open Graph images (lib/seo/og-image.tsx) must draw the same mark, and lib may not import
// components. components/ui/BrandMark and components/ui/BrandLockup re-export from here, so
// there is still exactly one source for the paths and the scale.

export type BrandLockupSize = "sm" | "md" | "lg" | "hero";
export type BrandLockupOrientation = "horizontal" | "stacked";

export type BrandMarkCut = {
  block: string;
  counter: string;
};

export type BrandLockupScale = {
  gap: number;
  mark: number;
  type: number;
};

export const BRAND_WORDMARK = "bisibility";

/** At and below this size the counter fills in under antialiasing, so the small cut is used. */
export const BRAND_MARK_SMALL_CUT_MAX_SIZE = 18;

/** 22px corner radius, 27px counter. Used above BRAND_MARK_SMALL_CUT_MAX_SIZE. */
export const BRAND_MARK_STANDARD_CUT: BrandMarkCut = {
  block: "M22 0H74A22 22 0 0 1 96 22V74A22 22 0 0 1 74 96H22A22 22 0 0 1 0 74V22A22 22 0 0 1 22 0Z",
  counter: "M75 48a27 27 0 1 0-54 0a27 27 0 1 0 54 0",
};

/** Wider counter and tighter corners so the hole survives small rasters. */
export const BRAND_MARK_SMALL_CUT: BrandMarkCut = {
  block: "M16 0H80A16 16 0 0 1 96 16V80A16 16 0 0 1 80 96H16A16 16 0 0 1 0 80V16A16 16 0 0 1 16 0Z",
  counter: "M76 48a28 28 0 1 0-56 0a28 28 0 1 0 56 0",
};

export const BRAND_MARK_VIEW_BOX_SIZE = 96;

const HORIZONTAL_SCALE: Record<BrandLockupSize, BrandLockupScale> = {
  sm: { gap: 5, mark: 18, type: 14 },
  md: { gap: 7, mark: 26, type: 20 },
  lg: { gap: 12, mark: 44, type: 36 },
  hero: { gap: 19, mark: 70, type: 56 },
};

/** Stacked is one fixed scale; the size prop only drives the horizontal lockup. */
const STACKED_SCALE: BrandLockupScale = { gap: 14, mark: 64, type: 26 };

export function brandMarkCut(size: number): BrandMarkCut {
  return size <= BRAND_MARK_SMALL_CUT_MAX_SIZE ? BRAND_MARK_SMALL_CUT : BRAND_MARK_STANDARD_CUT;
}

export function brandMarkPath(size: number): string {
  const cut = brandMarkCut(size);
  return `${cut.block} ${cut.counter}`;
}

export function brandLockupScale(
  size: BrandLockupSize,
  orientation: BrandLockupOrientation,
): BrandLockupScale {
  return orientation === "stacked" ? STACKED_SCALE : HORIZONTAL_SCALE[size];
}
