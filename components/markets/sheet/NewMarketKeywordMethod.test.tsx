import { renderWithFeatureMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import en from "@/messages/core/en/project-markets.json";
import es from "@/messages/core/es-ES/project-markets.json";
import ja from "@/messages/core/ja/project-markets.json";
import pl from "@/messages/core/pl/project-markets.json";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NewMarketKeywordMethod } from "./NewMarketKeywordMethod";

it.each([
  { locale: "en", messages: en, labels: ["Copy", "Paste", "Empty"] },
  { locale: "pl", messages: pl, labels: ["Kopiuj", "Wklej", "Od zera"] },
  { locale: "es-ES", messages: es, labels: ["Copiar", "Pegar", "En blanco"] },
  { locale: "ja", messages: ja, labels: ["コピー", "貼り付け", "空の状態"] },
] as const)(
  "keeps compact, unwrapped source choices with full names in $locale",
  ({ locale, messages, labels }) => {
    const onChange = vi.fn();
    render(
      <NewMarketKeywordMethod
        onChange={onChange}
        pasteError={null}
        sources={[]}
        value={undefined}
      />,
      { locale, messages },
    );
    const names = messages.projectMarkets;
    const choices = [names.copyFromMarket, names.pasteKeywords, names.startEmpty];
    for (const [index, name] of choices.entries()) {
      const radio = screen.getByRole("radio", { name });
      const label = radio.nextElementSibling;
      expect.soft(label?.textContent).toBe(labels[index]);
      expect
        .soft(name.toLocaleLowerCase(locale))
        .toContain((label?.textContent ?? "").toLocaleLowerCase(locale));
      expect.soft(label).toHaveClass("whitespace-nowrap");
      expect.soft(label).not.toHaveClass("truncate");
      fireEvent.click(radio);
    }
    expect
      .soft(onChange.mock.calls.map(([choice]) => choice.kind))
      .toEqual(["copy", "paste", "empty"]);
  },
);
