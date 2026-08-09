import {
  BRAND_WORDMARK,
  type BrandLockupOrientation,
  type BrandLockupSize,
  brandLockupScale,
} from "@/lib/ui/brand";
import { cn } from "@/lib/ui/cn";
import { BRAND_TONE_COLOR, BrandMark, type BrandTone } from "./BrandMark";

export { BRAND_WORDMARK, brandLockupScale } from "@/lib/ui/brand";
export type { BrandLockupOrientation, BrandLockupSize };

export type BrandLockupProps = {
  className?: string;
  /** Drops the wordmark and moves the accessible name onto the mark. */
  markOnly?: boolean;
  orientation?: BrandLockupOrientation;
  size?: BrandLockupSize;
  tone?: BrandTone;
};

export function BrandLockup({
  className,
  markOnly = false,
  orientation = "horizontal",
  size = "md",
  tone = "fg",
}: BrandLockupProps) {
  const scale = brandLockupScale(size, orientation);

  if (markOnly) {
    return <BrandMark className={className} label={BRAND_WORDMARK} size={scale.mark} tone={tone} />;
  }

  const stacked = orientation === "stacked";

  return (
    <span
      className={cn("inline-flex items-center", stacked && "flex-col justify-center", className)}
      style={{
        color: BRAND_TONE_COLOR[tone],
        columnGap: stacked ? undefined : scale.gap,
        rowGap: stacked ? scale.gap : undefined,
      }}
    >
      {/* The wordmark carries the accessible name, so the mark stays decorative. */}
      <BrandMark size={scale.mark} tone={tone} />
      <span className="font-bold leading-none tracking-[-0.045em]" style={{ fontSize: scale.type }}>
        {BRAND_WORDMARK}
      </span>
    </span>
  );
}
