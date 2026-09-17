import { DateDisplayProvider, DateFormatProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type { AppLocale } from "@/i18n/config";
import { DEFAULT_TIME_ZONE } from "@/i18n/formats";
import sharedMessages from "@/messages/core/en/shared.json";
import { render, screen } from "@testing-library/react";
import type { AbstractIntlMessages } from "next-intl";
import { act, type ComponentProps } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZonedTime } from "./ZonedTime";

function ZonedTimeWithDisplay({
  dateFormat = "month_first",
  locale = "en",
  messages = sharedMessages,
  ...props
}: ComponentProps<typeof ZonedTime> & {
  dateFormat?: "day_first" | "iso" | "month_first";
  locale?: AppLocale;
  messages?: AbstractIntlMessages;
}) {
  return (
    <FeatureMessagesProvider locale={locale} messages={messages} timeZone={DEFAULT_TIME_ZONE}>
      <DateFormatProvider value={dateFormat}>
        <DateDisplayProvider>
          <ZonedTime {...props} />
        </DateDisplayProvider>
      </DateFormatProvider>
    </FeatureMessagesProvider>
  );
}

describe("ZonedTime", () => {
  const originalTZ = process.env.TZ;

  afterEach(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  it("renders (your time) when the browser timezone matches the project timezone", () => {
    process.env.TZ = "Europe/Madrid";
    render(<ZonedTimeWithDisplay timeZone="Europe/Madrid" value="2026-07-24T14:17:00.000Z" />);

    expect(screen.getByText(/\(your time\)/)).toBeInTheDocument();
  });

  it("renders the supplied project timezone when the browser timezone differs", () => {
    process.env.TZ = "America/New_York";
    render(<ZonedTimeWithDisplay timeZone="Europe/Madrid" value="2026-07-24T14:17:00.000Z" />);

    expect(screen.getByText(/\(Europe\/Madrid\)/)).toBeInTheDocument();
  });

  it("localizes the complete browser-zone message without translating the IANA identifier", () => {
    process.env.TZ = "America/New_York";
    render(
      <ZonedTimeWithDisplay
        dateFormat="day_first"
        locale="pl"
        messages={{
          shared: {
            controls: {
              zonedTime: {
                plain: "{time}",
                timeZone: "{time} - strefa {timeZone}",
                yourTime: "{time} - Twoja strefa",
              },
            },
          },
        }}
        timeZone="Europe/Madrid"
        value="2026-07-24T14:17:00.000Z"
      />,
    );

    expect(screen.getByText("24 lipca 2026, 16:17 - strefa Europe/Madrid")).toBeInTheDocument();
  });

  it("SSR output contains the project-zone absolute time and no suffix text", () => {
    const savedWindow = globalThis.window;
    // @ts-expect-error: simulate server environment for SSR
    globalThis.window = undefined;
    try {
      const markup = renderToStaticMarkup(
        <ZonedTimeWithDisplay timeZone="Europe/Warsaw" value="2026-07-24T14:17:00.000Z" />,
      );
      expect(markup).toContain("Jul 24, 2026, 16:17");
      expect(markup).not.toContain("your time");
      expect(markup).not.toContain("Europe/Warsaw");
    } finally {
      globalThis.window = savedWindow;
    }
  });

  it("dateTime contains the normalized UTC ISO timestamp", () => {
    process.env.TZ = "UTC";
    render(<ZonedTimeWithDisplay timeZone="UTC" value="2026-07-24T14:17:00.000Z" />);

    const time = document.querySelector("time");
    expect(time).not.toBeNull();
    expect(time).toHaveAttribute("dateTime", "2026-07-24T14:17:00.000Z");
  });

  it("hydrates without a mismatch and then reveals the browser-zone suffix", async () => {
    process.env.TZ = "America/New_York";
    const savedWindow = globalThis.window;
    let markup: string;
    try {
      // @ts-expect-error: simulate server environment for SSR
      globalThis.window = undefined;
      markup = renderToString(
        <ZonedTimeWithDisplay timeZone="Europe/Madrid" value="2026-07-24T14:17:00.000Z" />,
      );
    } finally {
      globalThis.window = savedWindow;
    }
    const container = document.createElement("div");
    container.innerHTML = markup;
    document.body.append(container);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const root = hydrateRoot(
      container,
      <ZonedTimeWithDisplay timeZone="Europe/Madrid" value="2026-07-24T14:17:00.000Z" />,
    );

    await act(async () => undefined);

    expect(container).toHaveTextContent("(Europe/Madrid)");
    expect(consoleError).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    consoleError.mockRestore();
    container.remove();
  });
});
