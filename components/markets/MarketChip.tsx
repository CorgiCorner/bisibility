import { quietChipVariants } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
import {
  DeviceMobileIcon as DeviceMobile,
  MonitorIcon as Monitor,
} from "@phosphor-icons/react/dist/ssr";

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

const deviceIcons = {
  desktop: { Icon: Monitor, label: "Desktop" },
  mobile: { Icon: DeviceMobile, label: "Mobile" },
} satisfies Record<MarketChipDevice, { Icon: typeof Monitor; label: "Desktop" | "Mobile" }>;

const deviceIconSize = {
  sm: 12,
  md: 13,
} satisfies Record<MarketChipSize, number>;

const deviceIconWellSize = {
  sm: "size-3",
  md: "size-[13px]",
} satisfies Record<MarketChipSize, string>;

export function MarketChip({
  className,
  device = null,
  languageLabel,
  locationLabel,
  size = "sm",
}: Readonly<MarketChipProps>) {
  const deviceIcon = device ? deviceIcons[device] : null;

  return (
    <span className={cn(quietChipVariants({ size }), className)}>
      {/* The language is what keeps `Belgium / Dutch` apart from `Belgium / French`, so it
          is the half that has to survive a narrow row: the location takes essentially all
          the shrink pressure and loses its tail, which still reads. Both still ellipsize,
          so even a label longer than the whole budget is never clipped mid-glyph. */}
      <span className="min-w-0 shrink-[999] truncate font-semibold text-fg">{locationLabel}</span>
      <span className="min-w-0 truncate text-fg-muted">/ {languageLabel}</span>
      {deviceIcon ? (
        <span
          className={cn(
            "grid shrink-0 place-items-center leading-none text-fg-muted",
            deviceIconWellSize[size],
          )}
          title={deviceIcon.label}
        >
          <deviceIcon.Icon
            aria-label={deviceIcon.label}
            className="block"
            role="img"
            size={deviceIconSize[size]}
          />
        </span>
      ) : null}
    </span>
  );
}
