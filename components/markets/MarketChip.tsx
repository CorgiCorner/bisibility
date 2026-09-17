import { quietChipVariants } from "@/components/ui/quiet-chip-styles";
import { languageDisplayName, regionDisplayName } from "@/lib/i18n/display-names";
import { cn } from "@/lib/ui/cn";
import { DeviceMobileIcon as DeviceMobile } from "@phosphor-icons/react/dist/ssr/DeviceMobile";
import { MonitorIcon as Monitor } from "@phosphor-icons/react/dist/ssr/Monitor";
import { useLocale, useTranslations } from "next-intl";

export type MarketChipDevice = "desktop" | "mobile";
export type MarketChipSize = "sm" | "md";

export type MarketChipProps = {
  className?: string;
  /** ISO alpha-2 of the stored location, so the country name follows the viewer locale. */
  countryCode?: string | null;
  /** ISO language code of the stored market, for the same reason. */
  languageCode?: string | null;
  /** Renders the device as an icon inside the chip. The icon is the only carrier of that
      fact, so it always ships an `aria-label` and a `title`. */
  device?: MarketChipDevice | null;
  languageLabel: string;
  locationLabel: string;
  size?: MarketChipSize;
};

const deviceIcons = {
  desktop: Monitor,
  mobile: DeviceMobile,
} satisfies Record<MarketChipDevice, typeof Monitor>;

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
  countryCode = null,
  device = null,
  languageCode = null,
  languageLabel,
  locationLabel,
  size = "sm",
}: Readonly<MarketChipProps>) {
  const t = useTranslations("shared.markets");
  const locale = useLocale();
  const location = regionDisplayName(countryCode, locationLabel, locale);
  const language = languageDisplayName(languageCode, languageLabel, locale);
  const DeviceIcon = device ? deviceIcons[device] : null;
  const deviceLabel = device ? t(device) : null;

  return (
    <span className={cn(quietChipVariants({ size }), className)}>
      {/* The language is what keeps `Belgium / Dutch` apart from `Belgium / French`, so it
          is the half that has to survive a narrow row: the location takes essentially all
          the shrink pressure and loses its tail, which still reads. Both still ellipsize,
          so even a label longer than the whole budget is never clipped mid-glyph. */}
      <span className="min-w-0 shrink-[999] truncate font-semibold text-fg">{location}</span>
      <span className="min-w-0 truncate text-fg-muted">/ {language}</span>
      {DeviceIcon && deviceLabel ? (
        <span
          className={cn(
            "grid shrink-0 place-items-center leading-none text-fg-muted",
            deviceIconWellSize[size],
          )}
          title={deviceLabel}
        >
          <DeviceIcon
            aria-label={deviceLabel}
            className="block"
            role="img"
            size={deviceIconSize[size]}
            weight="regular"
          />
        </span>
      ) : null}
    </span>
  );
}
