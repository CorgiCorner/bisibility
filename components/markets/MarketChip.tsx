import { cn } from "@/lib/ui/cn";
import {
  DeviceMobileIcon as DeviceMobile,
  MonitorIcon as Monitor,
} from "@phosphor-icons/react/dist/ssr";
import { cva } from "class-variance-authority";

export type MarketChipDevice = "desktop" | "mobile";
export type MarketChipSize = "sm" | "md";

export type MarketChipProps = {
  className?: string;
  /** Renders the device as an icon inside the chip. The icon is the only carrier of that
      fact, so it always ships an `aria-label` and a `title`. */
  device?: MarketChipDevice | null;
  languageLabel: string;
  locationLabel: string;
  size?: MarketChipSize;
};

// The canonical market rendering: `Malaga, Spain / Spanish`, location semibold so a
// same-geo pair stays distinguishable from its neighbour, language muted so it never
// competes with the location. Heights are pinned per size because these chips sit in
// dense rows whose height must not move when a chip appears.
const marketChipVariants = cva(
  "inline-flex max-w-full items-center overflow-hidden whitespace-nowrap rounded-full border border-border bg-bg-sunken text-xs",
  {
    variants: {
      size: {
        sm: "h-[22px] gap-1 px-[9px]",
        md: "h-6 gap-1.5 px-2.5",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  },
);

const deviceIcons = {
  desktop: { Icon: Monitor, label: "Desktop" },
  mobile: { Icon: DeviceMobile, label: "Mobile" },
} satisfies Record<MarketChipDevice, { Icon: typeof Monitor; label: string }>;

const deviceIconSize = {
  sm: 12,
  md: 13,
} satisfies Record<MarketChipSize, number>;

export function MarketChip({
  className,
  device = null,
  languageLabel,
  locationLabel,
  size = "sm",
}: Readonly<MarketChipProps>) {
  const deviceIcon = device ? deviceIcons[device] : null;

  return (
    <span className={cn(marketChipVariants({ size }), className)}>
      {/* The language is what keeps `Belgium / Dutch` apart from `Belgium / French`, so it
          is the half that has to survive a narrow row: the location takes essentially all
          the shrink pressure and loses its tail, which still reads. Both still ellipsize,
          so even a label longer than the whole budget is never clipped mid-glyph. */}
      <span className="min-w-0 shrink-[999] truncate font-semibold text-fg">{locationLabel}</span>
      <span className="min-w-0 truncate text-fg-muted">/ {languageLabel}</span>
      {deviceIcon ? (
        <span className="shrink-0 text-fg-muted" title={deviceIcon.label}>
          <deviceIcon.Icon aria-label={deviceIcon.label} role="img" size={deviceIconSize[size]} />
        </span>
      ) : null}
    </span>
  );
}
