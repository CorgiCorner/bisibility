import { UsageDisplaySettingsContext } from "@/components/metering/usage-display-context";
import { renderWithResearchMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { PaymentAmount, PaymentUnit } from "@/lib/action-payment/contract";
import {
  defaultUsageDisplayOptions,
  type UsageDisplayOptions,
} from "@/lib/project-usage-display/schema";
import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { usePaymentAmountFormatter } from "./use-payment-amount-formatter";

const credits: PaymentUnit = {
  kind: "credits",
  key: "bisibility",
  singular: "Credit",
  plural: "Credits",
};
const usd: PaymentUnit = { kind: "currency", code: "USD" };

function amount(
  value: string,
  unit: PaymentUnit,
  certainty: PaymentAmount["certainty"] = "measured",
): PaymentAmount {
  return { certainty, unit, value };
}

function Shown({ value }: { value: PaymentAmount }) {
  const presented = usePaymentAmountFormatter()(value);
  return <span title={presented.title}>{presented.text}</span>;
}

function renderAmount(value: PaymentAmount, options?: Partial<UsageDisplayOptions>) {
  const shown = <Shown value={value} />;
  if (!options) return render(shown);
  return render(
    <UsageDisplaySettingsContext.Provider
      value={{
        canEdit: false,
        error: null,
        options: { ...defaultUsageDisplayOptions, ...options },
        pending: false,
        setOptions: () => undefined,
      }}
    >
      {shown}
    </UsageDisplaySettingsContext.Provider>,
  );
}

function expectAmount(text: string, title?: string) {
  const node = screen.getByText(text);
  if (title) expect(node).toHaveAttribute("title", title);
  else expect(node).not.toHaveAttribute("title");
}

it("uses the mounted display precision and titles only a rounded amount", () => {
  const { rerender } = renderAmount(amount("9.8889", credits, "estimate"));
  expectAmount("≈ 9.89 Credits", "≈ 9.8889 Credits");

  rerender(<Shown value={amount("4", credits, "estimate")} />);
  expectAmount("≈ 4 Credits");

  rerender(
    <UsageDisplaySettingsContext.Provider
      value={{
        canEdit: false,
        error: null,
        options: {
          ...defaultUsageDisplayOptions,
          moneyFractionDigits: 0,
          quantityFractionDigits: 0,
        },
        pending: false,
        setOptions: () => undefined,
      }}
    >
      <Shown value={amount("9.8889", credits, "estimate")} />
    </UsageDisplaySettingsContext.Provider>,
  );
  expectAmount("≈ 10 Credits", "≈ 9.8889 Credits");

  rerender(
    <UsageDisplaySettingsContext.Provider
      value={{
        canEdit: false,
        error: null,
        options: {
          ...defaultUsageDisplayOptions,
          moneyFractionDigits: 4,
          quantityFractionDigits: 4,
        },
        pending: false,
        setOptions: () => undefined,
      }}
    >
      <Shown value={amount("9.88889", credits)} />
    </UsageDisplaySettingsContext.Provider>,
  );
  expectAmount("9.8889 Credits", "9.88889 Credits");
});

it.each([
  ["1.234", usd, "measured", 2, "$1.23", "$1.234"],
  ["1.5", usd, "measured", 0, "$2", "$1.50"],
  ["1.23456", usd, "measured", 4, "$1.2346", "$1.23456"],
  ["0.004", credits, "estimate", 2, "≈ < 0.01 Credits", "≈ 0.004 Credits"],
  ["0.00004", credits, "measured", 4, "< 0.0001 Credits", "0.00004 Credits"],
  ["0.4", credits, "estimate", 0, "≈ < 1 Credit", "≈ 0.4 Credits"],
] as const)("presents %s", (value, unit, certainty, digits, text, title) => {
  renderAmount(amount(value, unit, certainty), {
    moneyFractionDigits: digits,
    quantityFractionDigits: digits,
  });
  expectAmount(text, title);
});
