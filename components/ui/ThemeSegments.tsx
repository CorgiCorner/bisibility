"use client";

import {
  applyTheme,
  readThemePreference,
  subscribeThemePreference,
  type ThemePreference,
} from "@/lib/theme/browser-theme";
import { cn } from "@/lib/ui/cn";
import Tooltip from "@mui/material/Tooltip";
import {
  MonitorIcon as Monitor,
  MoonStarsIcon as MoonStars,
  PaletteIcon as Palette,
  SunIcon as Sun,
} from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import { useSyncExternalStore } from "react";

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

const groupVariants = cva(
  "m-0 inline-flex items-center border border-border-strong bg-transparent",
  {
    variants: {
      size: {
        sm: "gap-0.5 rounded-lg p-0.5",
        md: "gap-1 rounded-[10px] p-1",
      },
    },
    defaultVariants: { size: "sm" },
  },
);

// Never below 24px: a segment is the whole hit target (WCAG 2.5.8).
const segmentVariants = cva(
  "grid cursor-pointer place-items-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid",
  {
    variants: {
      size: {
        sm: "h-6 w-[26px] rounded-md",
        md: "h-7 w-8 rounded-[7px]",
      },
      active: {
        // --accent is only 2.69:1 on the cream background, under the 3:1 that SC 1.4.11
        // asks of a non-text indicator. --accent-solid clears it in both schemes.
        true: "bg-accent-solid text-primary-contrast",
        false: "text-fg-muted hover:text-fg",
      },
    },
    defaultVariants: { size: "sm", active: false },
  },
);

const iconSizeBySegmentSize = { sm: 13, md: 15 } as const;

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
  const iconSize = iconSizeBySegmentSize[size];

  return (
    <fieldset aria-label="Theme" className={cn(groupVariants({ size }), className)}>
      {segments.map(({ preference: mode, label, Icon }) => {
        const active = preference === mode;
        return (
          // MUI spreads `children.props` last, so the explicit aria-label below wins over the
          // aria-label Tooltip derives from `title`: one accessible name, plus a hover hint.
          <Tooltip key={mode} title={label}>
            <button
              aria-label={label}
              aria-pressed={active}
              className={segmentVariants({ active, size })}
              onClick={() => applyTheme(mode)}
              type="button"
            >
              <Icon aria-hidden size={iconSize} weight="regular" />
            </button>
          </Tooltip>
        );
      })}
    </fieldset>
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
