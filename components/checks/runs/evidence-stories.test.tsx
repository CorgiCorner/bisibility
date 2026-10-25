import { withEvidenceMessages } from "@/.storybook/evidence-messages";
import { storyTimeZone } from "@/.storybook/story-locale";
import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { render, screen } from "@testing-library/react";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { expect, it } from "vitest";

function Probe() {
  const t = useTranslations("projectRankTracker.checks.evidence");
  const locale = useLocale(),
    timeZone = useTimeZone(),
    display = useDateDisplay();
  return (
    <p>
      {t("customRange")} / {locale} / {timeZone} / {display.timeZone}
    </p>
  );
}
it.each([
  ["en", "Custom range"],
  ["pl", "Własny zakres"],
  ["ja", "期間を指定"],
  ["es-ES", "Rango personalizado"],
])("UI-9 renders selected %s catalogs and the time-zone global", (locale, label) => {
  const context = {
    globals: { locale, timeZone: "Asia/Tokyo" },
    args: {},
  } as unknown as Parameters<typeof withEvidenceMessages>[1];
  render(withEvidenceMessages(() => <Probe />, context) as ReactElement);
  expect(screen.getByText(`${label} / ${locale} / Asia/Tokyo / Asia/Tokyo`)).toBeInTheDocument();
});

it.each(["UTC", "Europe/Warsaw", "Asia/Tokyo"])(
  "UI-9 retains URL zone %s despite Storybook slash sanitization",
  (timeZone) => {
    expect(storyTimeZone("UTC", `?globals=locale:pl;timeZone:${timeZone}`)).toBe(timeZone);
  },
);
it("UI-9 rejects unsupported URL zones and falls back to a valid toolbar zone", () => {
  expect(storyTimeZone("UTC", "?globals=timeZone:Unknown/Injected")).toBe("UTC");
  expect(storyTimeZone("Asia/Tokyo", "?globals=timeZone:Unknown/Injected")).toBe("Asia/Tokyo");
  expect(storyTimeZone("Unknown/Injected", "")).toBe("UTC");
});
