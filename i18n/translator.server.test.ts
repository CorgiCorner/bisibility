import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { useFormatter } from "next-intl";
import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_TIME_ZONE } from "./formats";
import { createIntlTranslator } from "./translator.server";

function InstantMessage({ value }: Readonly<{ value: Date }>) {
  const format = useFormatter();
  const date = format.dateTime(value, { dateStyle: "short" });
  const time = format.dateTime(value, { timeStyle: "short" });
  return createElement("span", null, `${date} ${time}`);
}

describe("explicit server translator", () => {
  it("uses the selected active locale and supplied catalog rather than the request default", () => {
    const t = createIntlTranslator(
      "es-ES",
      {
        shared: { amount: "Total: {value, number}" },
      },
      { timeZone: DEFAULT_TIME_ZONE },
    );

    expect(t("shared.amount", { value: 1234567 })).toBe("Total: 1.234.567");
  });

  it("matches the client provider for an ICU instant across a calendar-day boundary", () => {
    const timeZone = "America/Los_Angeles";
    const instant = new Date("2026-01-01T00:30:00.000Z");
    const messages = {
      account: {
        preferences: {
          date: { auto: "{date, date, short} {date, time, short}" },
        },
      },
    };
    const t = createIntlTranslator("en", messages, { timeZone });
    const serverValue = t("account.preferences.date.auto", { date: instant });
    const providerProps: ComponentProps<typeof FeatureMessagesProvider> = {
      children: createElement(InstantMessage, { value: instant }),
      locale: "en",
      messages,
      timeZone,
    };
    const clientMarkup = renderToStaticMarkup(
      createElement(FeatureMessagesProvider, providerProps),
    );

    expect(serverValue).toContain("12/31/25");
    expect(serverValue).toContain("4:30 PM");
    expect(clientMarkup).toBe(`<span>${serverValue}</span>`);
  });
});
