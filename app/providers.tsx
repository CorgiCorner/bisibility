"use client";

import { themeCookieStorageManager } from "@/lib/theme/browser-theme";
import { theme } from "@/lib/theme/theme";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { type ReactNode, useEffect } from "react";

type ProvidersProps = { children: ReactNode };

export function Providers({ children }: Readonly<ProvidersProps>) {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
    return () => {
      delete document.documentElement.dataset.hydrated;
    };
  }, []);

  return (
    // `prepend` keeps MUI styles ahead of the app stylesheets (the old `injectFirst` contract)
    // without `StyledEngineProvider`, whose own `css` cache also runs on the server and streams
    // inline <style> tags the client never renders - a guaranteed hydration mismatch.
    <AppRouterCacheProvider options={{ key: "mui", prepend: true }}>
      <ThemeProvider
        defaultMode="system"
        modeStorageKey="theme"
        storageManager={themeCookieStorageManager}
        theme={theme}
      >
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
