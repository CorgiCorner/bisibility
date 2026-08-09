import {
  BRAND_MARK_VIEW_BOX_SIZE,
  BRAND_WORDMARK,
  brandLockupScale,
  brandMarkPath,
} from "@/lib/ui/brand";

// Open Graph images render through Satori, which resolves neither CSS variables nor Tailwind,
// so the shared lockup cannot be reused directly: the colours are literals from
// app/globals.css (light theme) and every box is an explicit flex style.
const MARK_COLOR = "#1a1813";
const TAGLINE_COLOR = "#6b6657";

const SCALE = brandLockupScale("hero", "horizontal");

export const OG_TAGLINE = "SEO observability for developers";

/** The hero lockup plus the product tagline, as both Open Graph images draw it. */
export function OpenGraphBrandLockup() {
  return (
    <div style={{ alignItems: "center", display: "flex", gap: `${SCALE.gap}px` }}>
      <svg
        fill="none"
        height={SCALE.mark}
        viewBox={`0 0 ${BRAND_MARK_VIEW_BOX_SIZE} ${BRAND_MARK_VIEW_BOX_SIZE}`}
        width={SCALE.mark}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d={brandMarkPath(SCALE.mark)} fill={MARK_COLOR} fillRule="evenodd" />
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ fontSize: SCALE.type, fontWeight: 800, letterSpacing: 0 }}>
          {BRAND_WORDMARK}
        </div>
        <div style={{ color: TAGLINE_COLOR, fontSize: 24 }}>{OG_TAGLINE}</div>
      </div>
    </div>
  );
}
