"use client";

import {
  applyTheme,
  readThemePreference,
  subscribeThemePreference,
  type ThemePreference,
} from "@/lib/theme/browser-theme";
import {
  MonitorIcon as Monitor,
  MoonStarsIcon as MoonStars,
  PaletteIcon as Palette,
  SunIcon as Sun,
} from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";
import { SegmentedControl, type SegmentedControlSize } from "./SegmentedControl";

export type ThemeSegmentsSize = "sm" | "md";

export type ThemeSegmentsProps = {
  className?: string;
  /** Server-rendered starting point; the cookie takes over once hydrated. */
  defaultPreference?: ThemePreference;
  size?: ThemeSegmentsSize;
};

const segments = [
  { preference: "light" as const, label: "Light", Icon: Sun },
  { preference: "dark" as const, label: "Dark", Icon: MoonStars },
  { preference: "system" as const, label: "System", Icon: Monitor },
];

const iconSizeBySize = { sm: 13, md: 15 } as const;

const segmentedSizeByThemeSize: Record<ThemeSegmentsSize, SegmentedControlSize> = {
  sm: "xs",
  md: "default",
};

const optionClassNameBySize: Record<ThemeSegmentsSize, string> = {
  sm: "w-[26px] px-0 rounded-md",
  md: "h-7 min-h-0 w-8 px-0 py-0",
};

export function ThemeSegments({
  className,
  defaultPreference = "system",
  size = "sm",
}: Readonly<ThemeSegmentsProps>) {
  const preference = useSyncExternalStore(
    subscribeThemePreference,
    readThemePreference,
    () => defaultPreference,
  );
  const iconSize = iconSizeBySize[size];

  return (
    <SegmentedControl
      ariaLabel="Theme"
      className={className}
      fitContent
      onChange={(value) => applyTheme(value as ThemePreference)}
      optionClassName={optionClassNameBySize[size]}
      options={segments.map(({ preference: mode, label, Icon }) => ({
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
  return (
    <div className="flex items-center justify-between gap-2 px-[9px] py-1.5">
      <span className="inline-flex items-center gap-[9px] text-[13px] text-fg">
        <Palette aria-hidden className="text-fg-muted" size={16} />
        Theme
      </span>
      <ThemeSegments defaultPreference={defaultPreference} size="sm" />
    </div>
  );
}
