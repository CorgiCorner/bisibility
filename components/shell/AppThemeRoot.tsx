"use client";

import { readTheme, subscribeTheme, type ThemeMode } from "@/lib/theme/browser-theme";
import { type ComponentPropsWithoutRef, useSyncExternalStore } from "react";

type AppThemeRootProps = ComponentPropsWithoutRef<"div"> & {
  defaultTheme: ThemeMode;
};

export function AppThemeRoot({ defaultTheme, ...props }: Readonly<AppThemeRootProps>) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => defaultTheme);

  return <div {...props} data-app-theme-root data-theme={theme} />;
}
