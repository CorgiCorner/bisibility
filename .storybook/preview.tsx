import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { ThemeSegments } from "@/components/ui/ThemeSegments";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { DEFAULT_TIME_ZONE } from "@/i18n/formats";
import { initializeThemeFromCookie, readTheme } from "@/lib/theme/browser-theme";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Decorator, Preview } from "@storybook/nextjs-vite";
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

const withAppTheme: Decorator = (Story, context) => {
  const activeTheme = typeof document === "undefined" ? "light" : readTheme();

  return (
    <div
      className="min-h-screen bg-bg font-sans text-fg"
      data-app-theme-root
      data-theme={activeTheme}
    >
      <FeatureMessagesProvider
        locale={DEFAULT_LOCALE}
        messages={sharedMessages}
        timeZone={DEFAULT_TIME_ZONE}
      >
        <TooltipProvider>
          <Story />
          {context.viewMode === "story" && context.parameters.themeControls !== false ? (
            <div className="fixed right-4 bottom-4 z-[1400]">
              <ThemeSegments size="sm" />
            </div>
          ) : null}
        </TooltipProvider>
      </FeatureMessagesProvider>
    </div>
  );
};

const preview: Preview = {
  decorators: [withAppTheme],
  parameters: {
    backgrounds: { disabled: true },
    controls: { expanded: true },
  },
};

export default preview;
