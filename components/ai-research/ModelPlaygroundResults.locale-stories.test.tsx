import { render, screen } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { expect, it, vi } from "vitest";
import meta from "./ModelPlaygroundResults.stories";

vi.mock("./ModelPlaygroundResults", () => ({ ModelPlaygroundResults: () => null }));

function TrackingProbe() {
  const t = useTranslations("projectAiTracking");
  return <p>{t("generationTitle")}</p>;
}

it.each([
  ["en", "Generate prompt drafts"],
  ["es-ES", "Generar borradores de prompts"],
  ["ja", "プロンプトの下書きを生成"],
  ["pl", "Wygeneruj wersje robocze promptów"],
])("renders tracking from the %s story's catalog", (locale, expected) => {
  const decorator = meta.decorators[0];
  // This decorator reads only parameters; the remaining Storybook runtime is outside this test.
  const context = { parameters: { locale } } as unknown as Parameters<typeof decorator>[1];
  render(decorator(() => <TrackingProbe />, context));
  expect(screen.getByText(expected)).toBeVisible();
});
