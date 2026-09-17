import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider, useFormatter, useTranslations } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { coreMessages } from "./core-messages";
import { DEFAULT_TIME_ZONE, formats } from "./formats";

function PreferenceCount() {
  const t = useTranslations("account.preferences");
  return <span>{t("savedCount", { count: 2 })}</span>;
}

function ProviderTree() {
  return (
    <NextIntlClientProvider
      formats={formats}
      locale="en"
      messages={coreMessages}
      timeZone={DEFAULT_TIME_ZONE}
    >
      <PreferenceCount />
    </NextIntlClientProvider>
  );
}

function SharedControl() {
  const t = useTranslations("shared.language");
  return <span>{t("label")}</span>;
}

function LocalizedNumber() {
  const format = useFormatter();
  return <span>{format.number(1234567)}</span>;
}

function FeatureTree() {
  return (
    <FeatureMessagesProvider locale="en" messages={coreMessages} timeZone={DEFAULT_TIME_ZONE}>
      <PreferenceCount />
      <SharedControl />
      <LocalizedNumber />
    </FeatureMessagesProvider>
  );
}

function SpanishTree() {
  return (
    <FeatureMessagesProvider
      locale="es-ES"
      messages={{
        account: { preferences: { savedCount: "{count} preferencias guardadas" } },
        shared: { language: { label: "Idioma" } },
      }}
      timeZone={DEFAULT_TIME_ZONE}
    >
      <PreferenceCount />
      <SharedControl />
      <LocalizedNumber />
    </FeatureMessagesProvider>
  );
}

describe("provider consistency", () => {
  it("renders the same catalog message for server markup and the client tree", () => {
    const serverMarkup = renderToStaticMarkup(<ProviderTree />);
    render(<ProviderTree />);

    expect(serverMarkup).toContain("2 preferences saved");
    expect(screen.getByText("2 preferences saved")).toBeVisible();
  });

  it("keeps shared controls available inside a feature-only catalog boundary", () => {
    const serverMarkup = renderToStaticMarkup(<FeatureTree />);
    render(<FeatureTree />);

    expect(serverMarkup).toContain("Language");
    expect(screen.getByText("Language")).toBeVisible();
    expect(screen.getByText("2 preferences saved")).toBeVisible();
  });

  it("renders an activated secondary locale from an explicit catalog payload", () => {
    const serverMarkup = renderToStaticMarkup(<SpanishTree />);
    render(<SpanishTree />);

    expect(serverMarkup).toContain("Idioma");
    expect(screen.getByText("Idioma")).toBeVisible();
    expect(screen.getByText("2 preferencias guardadas")).toBeVisible();
    expect(screen.getByText("1.234.567")).toBeVisible();
  });
});
