import { ThemeToggle } from "@/components/theme/ThemeToggle";
import {
  initializeThemeFromCookie,
  readTheme,
  themeCookieStorageManager,
} from "@/lib/theme/browser-theme";
import { theme } from "@/lib/theme/theme";
import CssBaseline from "@mui/material/CssBaseline";
import { StyledEngineProvider, ThemeProvider } from "@mui/material/styles";
import type { Decorator, Preview } from "@storybook/react";
import "../app/globals.css";
import "./preview-fonts.css";

class StorybookEventSource extends EventTarget {
  static readonly CLOSED = 2;
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;

  readonly url: string;
  readonly withCredentials = false;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  readyState = StorybookEventSource.CLOSED;

  constructor(url: string | URL) {
    super();
    this.url = String(url);
    queueMicrotask(() => {
      const event = new Event("error");
      this.onerror?.(event);
      this.dispatchEvent(event);
    });
  }

  close() {
    this.readyState = StorybookEventSource.CLOSED;
  }
}

if (typeof window !== "undefined") {
  window.EventSource = StorybookEventSource as typeof EventSource;
  initializeThemeFromCookie();
}

const withMuiTheme: Decorator = (Story, context) => {
  const activeTheme = typeof document === "undefined" ? "light" : readTheme();

  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider
        defaultMode="light"
        modeStorageKey="theme"
        storageManager={themeCookieStorageManager}
        theme={theme}
      >
        <div
          className="min-h-screen bg-bg font-sans text-fg"
          data-app-theme-root
          data-theme={activeTheme}
        >
          <CssBaseline />
          <Story />
          {context.viewMode === "story" ? (
            <div className="fixed right-4 bottom-4 z-[1400]">
              <ThemeToggle />
            </div>
          ) : null}
        </div>
      </ThemeProvider>
    </StyledEngineProvider>
  );
};

const preview: Preview = {
  decorators: [withMuiTheme],
  parameters: {
    backgrounds: { disable: true },
    controls: { expanded: true },
  },
};

export default preview;
