"use client";

import { applyTheme, readTheme, subscribeTheme, type ThemeMode } from "@/lib/theme/browser-theme";
import Tooltip from "@mui/material/Tooltip";
import {
  MoonStarsIcon as MoonStars,
  PaletteIcon as Palette,
  SunIcon as Sun,
} from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";

export type ThemeSegmentsProps = {
  defaultTheme?: ThemeMode;
};

const segments = [
  { mode: "light" as const, label: "Light", Icon: Sun },
  { mode: "dark" as const, label: "Dark", Icon: MoonStars },
];

export function ThemeSegments({ defaultTheme = "light" }: Readonly<ThemeSegmentsProps>) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => defaultTheme);

  function choose(next: ThemeMode) {
    applyTheme(next);
  }

  return (
    <div className="flex items-center justify-between gap-2 px-[9px] py-1.5">
      <span className="inline-flex items-center gap-[9px] text-[13px] text-fg">
        <Palette aria-hidden className="text-fg-muted" size={16} />
        Theme
      </span>
      <fieldset
        aria-label="Theme"
        className="m-0 flex items-center gap-0.5 rounded-lg border border-border-strong bg-bg-sunken p-0.5"
      >
        {segments.map(({ mode, label, Icon }) => {
          const active = theme === mode;
          return (
            <Tooltip key={mode} title={label}>
              <button
                aria-label={label}
                aria-pressed={active}
                className={[
                  "grid h-6 w-[26px] place-items-center rounded-md outline-none transition-colors",
                  active ? "bg-accent text-white" : "text-fg-muted",
                ].join(" ")}
                onClick={() => choose(mode)}
                type="button"
              >
                <Icon aria-hidden size={13} weight="regular" />
              </button>
            </Tooltip>
          );
        })}
      </fieldset>
    </div>
  );
}
