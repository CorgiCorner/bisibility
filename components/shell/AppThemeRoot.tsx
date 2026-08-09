"use client";

import { readTheme, subscribeTheme, type ThemeMode } from "@/lib/theme/browser-theme";
import { isSidebarCollapsed } from "@/lib/ui/sidebar-collapsed";
import { type ComponentPropsWithoutRef, useSyncExternalStore } from "react";
import { SidebarCollapsedProvider, useSidebarCollapsed } from "./SidebarCollapsedState";

type AppThemeRootProps = ComponentPropsWithoutRef<"div"> & {
  "data-collapsed"?: string;
  /** Undefined for the `system` preference: only the browser can resolve it, so the
   * pre-paint script owns the first paint and the shell inherits it from <html>. */
  defaultTheme: ThemeMode | undefined;
};

function AppThemeRootContent({ defaultTheme, ...props }: Readonly<AppThemeRootProps>) {
  const theme = useSyncExternalStore<ThemeMode | undefined>(
    subscribeTheme,
    readTheme,
    () => defaultTheme,
  );
  const { collapsed } = useSidebarCollapsed();

  return (
    <div
      {...props}
      data-app-theme-root
      data-collapsed={collapsed ? "true" : "false"}
      data-theme={theme}
    />
  );
}

export function AppThemeRoot({ defaultTheme, ...props }: Readonly<AppThemeRootProps>) {
  const defaultCollapsed = isSidebarCollapsed(props["data-collapsed"]);

  return (
    <SidebarCollapsedProvider defaultCollapsed={defaultCollapsed}>
      <AppThemeRootContent defaultTheme={defaultTheme} {...props} />
    </SidebarCollapsedProvider>
  );
}
