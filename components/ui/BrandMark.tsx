import { BRAND_MARK_VIEW_BOX_SIZE, type BrandMarkCut, brandMarkPath } from "@/lib/ui/brand";
import { cn } from "@/lib/ui/cn";

export type BrandTone = "fg" | "accent" | "inverse";

export type BrandMarkProps = {
  className?: string;
  /** Accessible name. Omitted keeps the mark decorative (`aria-hidden`). */
  label?: string;
  /** Rendered edge length in CSS px. Also picks the optical cut. */
  size?: number;
  tone?: BrandTone;
};

export {
  BRAND_MARK_SMALL_CUT,
  BRAND_MARK_SMALL_CUT_MAX_SIZE,
  BRAND_MARK_STANDARD_CUT,
  brandMarkCut,
  brandMarkPath,
} from "@/lib/ui/brand";
export type { BrandMarkCut };

export const BRAND_TONE_COLOR: Record<BrandTone, string> = {
  fg: "var(--fg)",
  accent: "var(--accent)",
  inverse: "var(--bg)",
};

export function BrandMark({ className, label, size = 26, tone = "fg" }: BrandMarkProps) {
  const named = label !== undefined;

  return (
    <svg
      aria-hidden={named ? undefined : "true"}
      aria-label={named ? label : undefined}
      className={cn("shrink-0", className)}
      height={size}
      role={named ? "img" : undefined}
      // Forced colors would repaint the whole path in one system colour and close the
      // evenodd counter, turning the mark into a solid block.
      style={{ color: BRAND_TONE_COLOR[tone], forcedColorAdjust: "none" }}
      viewBox={`0 0 ${BRAND_MARK_VIEW_BOX_SIZE} ${BRAND_MARK_VIEW_BOX_SIZE}`}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={brandMarkPath(size)} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
