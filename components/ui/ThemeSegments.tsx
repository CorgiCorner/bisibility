"use client";

import {
  applyTheme,
  readThemePreference,
  subscribeThemePreference,
  type ThemePreference,
} from "@/lib/theme/browser-theme";
import { cn } from "@/lib/ui/cn";
import { MonitorIcon as Monitor } from "@phosphor-icons/react/dist/csr/Monitor";
import { MoonStarsIcon as MoonStars } from "@phosphor-icons/react/dist/csr/MoonStars";
import { PaletteIcon as Palette } from "@phosphor-icons/react/dist/csr/Palette";
import { SunIcon as Sun } from "@phosphor-icons/react/dist/csr/Sun";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { SegmentedControl, type SegmentedControlSize } from "./SegmentedControl";

export type ThemeSegmentsSize = "sm" | "md";

export type ThemeSegmentsProps = {
  className?: string;
  activeClassName?: string;
  /** Server-rendered starting point; the cookie takes over once hydrated. */
  defaultPreference?: ThemePreference;
  size?: ThemeSegmentsSize;
};

const iconSizeBySize = { sm: 13, md: 15 } as const;

const segmentedSizeByThemeSize: Record<ThemeSegmentsSize, SegmentedControlSize> = {
  sm: "xs",
  md: "default",
};

const optionClassNameBySize: Record<ThemeSegmentsSize, string> = {
  sm: "w-[26px] px-0 rounded-control",
  md: "h-7 min-h-0 w-8 px-0 py-0",
};

export function ThemeSegments({
  className,
  activeClassName,
  defaultPreference = "system",
  size = "sm",
}: Readonly<ThemeSegmentsProps>) {
  const t = useTranslations("shared.controls.theme");
  const preference = useSyncExternalStore(
    subscribeThemePreference,
    readThemePreference,
    () => defaultPreference,
  );
  const iconSize = iconSizeBySize[size];

  return (
    <SegmentedControl
      ariaLabel={t("label")}
      className={className}
      fitContent
      onChange={(value) => applyTheme(value as ThemePreference)}
      activeClassName={cn("bg-bg-elev", activeClassName)}
      optionClassName={optionClassNameBySize[size]}
      options={[
        { preference: "light" as const, label: t("light"), Icon: Sun },
        { preference: "dark" as const, label: t("dark"), Icon: MoonStars },
        { preference: "system" as const, label: t("system"), Icon: Monitor },
      ].map(({ preference: mode, label, Icon }) => ({
        ariaLabel: label,
        label: <Icon aria-hidden size={iconSize} weight="regular" />,
        tooltip: label,
        value: mode,
      }))}
      size={segmentedSizeByThemeSize[size]}
      value={preference}
    />
  );
}

/** The user-menu row: a labelled line with the control pinned to the right. */
export function ThemeSegmentsRow({ defaultPreference }: Readonly<ThemeSegmentsProps>) {
  const t = useTranslations("shared.controls.theme");
  return (
    <div className="flex items-center justify-between gap-2 px-[9px] py-1.5">
      <span className="inline-flex items-center gap-[9px] text-[13px] text-fg">
        <Palette aria-hidden className="text-fg-muted" size={16} weight="regular" />
        {t("label")}
      </span>
      <ThemeSegments defaultPreference={defaultPreference} size="sm" />
    </div>
  );
}
