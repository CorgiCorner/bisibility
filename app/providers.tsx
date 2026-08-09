"use client";

import { themeCookieStorageManager } from "@/lib/theme/browser-theme";
import { theme } from "@/lib/theme/theme";
import CssBaseline from "@mui/material/CssBaseline";
import { StyledEngineProvider, ThemeProvider } from "@mui/material/styles";
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
    <AppRouterCacheProvider options={{ key: "mui" }}>
      <StyledEngineProvider injectFirst>
        <ThemeProvider
          defaultMode="system"
          modeStorageKey="theme"
          storageManager={themeCookieStorageManager}
          theme={theme}
        >
          <CssBaseline />
          {children}
        </ThemeProvider>
      </StyledEngineProvider>
    </AppRouterCacheProvider>
  );
}
