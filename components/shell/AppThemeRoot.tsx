"use client";

import { readTheme, subscribeTheme, type ThemeMode } from "@/lib/theme/browser-theme";
import { type ComponentPropsWithoutRef, useSyncExternalStore } from "react";
import { SidebarCollapsedProvider, useSidebarCollapsed } from "./SidebarCollapsedState";

type AppThemeRootProps = ComponentPropsWithoutRef<"div"> & {
  "data-collapsed"?: string;
  defaultTheme: ThemeMode;
};

function AppThemeRootContent({ defaultTheme, ...props }: Readonly<AppThemeRootProps>) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => defaultTheme);
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
  const defaultCollapsed = props["data-collapsed"] !== "false";

  return (
    <SidebarCollapsedProvider defaultCollapsed={defaultCollapsed}>
      <AppThemeRootContent defaultTheme={defaultTheme} {...props} />
    </SidebarCollapsedProvider>
  );
}
