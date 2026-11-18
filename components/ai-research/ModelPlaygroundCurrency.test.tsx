import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import { columnResult } from "@/lib/model-playground/result-fixtures.test-support";
import { projectColumnResult } from "@/lib/model-playground/result-view";
import type { ModelMoney } from "@/lib/model-playground/types";
import en from "@/messages/core/en/project-ai-research.json";
import es from "@/messages/core/es-ES/project-ai-research.json";
import ja from "@/messages/core/ja/project-ai-research.json";
import pl from "@/messages/core/pl/project-ai-research.json";
import { fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ModelPlaygroundColumnFooter } from "./ModelPlaygroundColumnFooter";

it.each([
  ["en", en, "$0.25"],
  ["es-ES", es, "0,25 US$"],
  ["ja", ja, "$0.25"],
  ["pl", pl, "0,25 USD"],
] as const)(
  "formats reported, estimated and detailed amounts in %s",
  (locale, messages, expected) => {
    for (const certainty of ["reported", "estimated"] as const) {
      const value = columnResult();
      value.providerCost = {
        amount: "0.25",
        currency: "USD",
        certainty,
        basis: certainty === "estimated" ? "rate_card" : "provider_response",
        rateCardVersion: certainty === "estimated" ? "fixture" : null,
      };
      value.costEvidence = {
        providerReported: null,
        localEstimate: {
          ...value.providerCost,
          certainty: "estimated",
          basis: "rate_card",
          rateCardVersion: "fixture",
        },
        upstreamInference: {
          total: {
            ...value.providerCost,
            certainty: "reported",
            basis: "provider_response",
            rateCardVersion: null,
          },
          input: null,
          output: null,
        },
      };
      const view = renderWithFeatureMessages(
        <ModelPlaygroundColumnFooter column={projectColumnResult(value)} onFullAnswer={() => {}} />,
        { locale, messages },
      );
      const normalize = (text: string | null | undefined) => text?.replace(/\s/g, " ");
      expect(normalize(view.container.querySelector("[data-column-cost]")?.textContent)).toContain(
        expected,
      );
      const details = [...view.container.querySelectorAll("dd")].filter((element) =>
        element.textContent?.includes(" · "),
      );
      expect(details).toHaveLength(2);
      for (const amount of details) expect(normalize(amount.textContent)).toContain(expected);
      expect(view.container.querySelector("[data-column-cost]")).toHaveTextContent(
        certainty === "estimated"
          ? messages.projectAiResearch.modelPlayground.estimatedUsage
          : messages.projectAiResearch.modelPlayground.reportedProvider,
      );
      view.unmount();
    }
  },
);

it("lets a catalog own estimate markers for summaries and detailed evidence", () => {
  const value = columnResult();
  const money = {
    amount: "0.00123456",
    currency: "EUR",
    certainty: "estimated" as const,
    basis: "rate_card" as const,
    rateCardVersion: "fixture",
  };
  value.providerCost = money;
  value.costEvidence = { providerReported: null, upstreamInference: null, localEstimate: money };
  const view = renderWithFeatureMessages(
    <ModelPlaygroundColumnFooter column={projectColumnResult(value)} onFullAnswer={() => {}} />,
    {
      locale: "pl",
      messages: {
        projectAiResearch: {
          ...pl.projectAiResearch,
          modelPlayground: {
            ...pl.projectAiResearch.modelPlayground,
            costLine:
              "{certainty, select, estimated {około {amount}} other {{amount}}} {scope} {qualifier}",
            moneyAmount:
              "{certainty, select, estimated {{amount} (przybliżenie)} other {{amount}}}",
          },
        },
      },
    },
  );
  expect(view.container.querySelector("[data-column-cost]")).toHaveTextContent(
    "około 0,00123456 €",
  );
  expect(view.container.querySelector("dl")).toHaveTextContent("0,00123456 € (przybliżenie)");
  expect(view.container.textContent).not.toContain("~");
});

it.each([
  ["9007199254740993.123456789012345678901", "9 007 199 254 740 993,123456789012345678901 USD"],
  ["0.00000000000000000000000001", "0,00000000000000000000000001 USD"],
  ["0", "0 USD"],
  ["-0.25", "-0,25 USD"],
  ["-00.25", "-0,25 USD"],
  ["1e-8", "0,00000001 USD"],
  ["-1e-8", "-0,00000001 USD"],
  ["1e+3", "1000 USD"],
  ["1e-400", `0,${"0".repeat(399)}1 USD`],
  ["1.25e+1", "12,5 USD"],
  ["-1.25e+1", "-12,5 USD"],
  ["12.5e-1", "1,25 USD"],
  ["0.001e1", "0,01 USD"],
  ["1.50e0", "1,50 USD"],
  ["5e0", "5 USD"],
  ["0e+2", "0 USD"],
  ["-0e+1", "-0 USD"],
  ["1e-998", `0,${"0".repeat(997)}1 USD`],
])("preserves the exact decimal receipt %s", (amount, expected) => {
  const value = columnResult();
  value.providerCost = {
    amount,
    currency: "USD",
    certainty: "reported",
    basis: "provider_response",
    rateCardVersion: null,
  };
  const view = renderWithFeatureMessages(
    <ModelPlaygroundColumnFooter column={projectColumnResult(value)} onFullAnswer={() => {}} />,
    { locale: "pl", messages: pl },
  );
  expect(
    view.container.querySelector("[data-column-cost]")?.textContent?.replace(/\s/g, " "),
  ).toContain(expected);
  expect(view.getByText(pl.projectAiResearch.modelPlayground.scopeUnknown)).toBeInTheDocument();
});

const unavailableAmounts = [
  [null, "USD"],
  [" 0.25", "USD"],
  ["+0.25", "USD"],
  ["NaN", "USD"],
  ["Infinity", "USD"],
  ["", "USD"],
  ["1.2.3", "USD"],
  ["0.25", "USDC"],
  ["0.25", "credits"],
  ["0.25", ""],
  ["9".repeat(1001), "USD"],
  [`0.${"0".repeat(1000)}1`, "USD"],
  ["1e+1000", "USD"],
  ["1e-1000", "USD"],
  ["1e-999", "USD"],
] as const;

it.each(unavailableAmounts.map(([amount, currency], index) => ({ amount, currency, index })))(
  "keeps the answer and disclosure usable for unavailable money case $index",
  ({ amount, currency }) => {
    for (const locale of ["en", "pl"] as const) {
      const messages = locale === "en" ? en : pl;
      const copy = messages.projectAiResearch.modelPlayground;
      for (const certainty of ["reported", "estimated"] as const) {
        const value = columnResult();
        const money: ModelMoney = {
          amount,
          currency,
          certainty,
          basis: certainty === "estimated" ? "rate_card" : "provider_response",
          rateCardVersion: certainty === "estimated" ? "fixture" : null,
        };
        value.providerCost = money;
        value.costEvidence = {
          providerReported: null,
          localEstimate: {
            ...money,
            certainty: "estimated",
            basis: "rate_card",
            rateCardVersion: "fixture",
          },
          upstreamInference: {
            total: {
              ...money,
              certainty: "reported",
              basis: "provider_response",
              rateCardVersion: null,
            },
            input: null,
            output: null,
          },
        };
        const column = projectColumnResult(value);
        const onFullAnswer = vi.fn();
        const view = renderWithFeatureMessages(
          <ModelPlaygroundColumnFooter column={column} onFullAnswer={onFullAnswer} />,
          { locale, messages },
        );
        const summary = view.container.querySelector("[data-column-cost]");
        expect(summary?.textContent?.split(" · ")[0]).toBe(copy.costUnavailable);
        expect(view.queryByText(copy.scopeUnknown)).not.toBeInTheDocument();
        const details = [...view.container.querySelectorAll("dd")].filter((row) =>
          row.textContent?.includes(" · "),
        );
        expect(details).toHaveLength(2);
        for (const row of details)
          expect(row.textContent?.split(" · ")[0]).toBe(copy.costUnavailable);
        const disclosure = view.getByRole("button", { name: copy.usageDetails });
        const answer = view.getByRole("button", { name: copy.retainedAnswer });
        for (const expanded of [true, false, true]) {
          fireEvent.click(disclosure);
          expect(disclosure).toHaveAttribute("aria-expanded", String(expanded));
          expect(answer).toBeEnabled();
        }
        fireEvent.click(answer);
        expect(onFullAnswer).toHaveBeenCalledOnce();
        expect(column.answer).toBe(value.answer);
        view.unmount();
      }
    }
  },
);

it("contains an unexpected Intl failure without losing the answer action", () => {
  const formatter = vi.spyOn(Intl, "NumberFormat").mockImplementation(() => {
    throw new RangeError("fixture Intl failure");
  });
  try {
    const onFullAnswer = vi.fn();
    const value = columnResult();
    value.providerCost = {
      amount: "0.25",
      currency: "USD",
      certainty: "reported",
      basis: "provider_response",
      rateCardVersion: null,
    };
    const view = renderWithFeatureMessages(
      <ModelPlaygroundColumnFooter
        column={projectColumnResult(value)}
        onFullAnswer={onFullAnswer}
      />,
      { messages: en },
    );
    expect(view.container.querySelector("[data-column-cost]")).toHaveTextContent(
      "Cost unavailable",
    );
    expect(formatter).toHaveBeenCalledWith(
      "en",
      expect.objectContaining({ style: "currency", currency: "USD" }),
    );
    fireEvent.click(view.getByRole("button", { name: "Full retained answer" }));
    expect(onFullAnswer).toHaveBeenCalledOnce();
  } finally {
    formatter.mockRestore();
  }
});
