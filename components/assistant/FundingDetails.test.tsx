import type { FundingOptionView } from "@/lib/assistant/wire";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, test } from "vitest";
import en from "../../messages/core/en/assistant.json";

const messages = en as never;

import { FundingDetails } from "./FundingDetails";

const option = (patch: Partial<FundingOptionView>): FundingOptionView => ({
  mode: "credits",
  provider: "openai",
  available: true,
  reason: null,
  usage: { usedCents: "2.5000", limitCents: "10.0000" },
  credential: null,
  ...patch,
});

function renderDetails(value: FundingOptionView) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FundingDetails option={value} />
    </NextIntlClientProvider>,
  );
}

test("renders monthly AI usage and a precise unavailable reason", () => {
  const { rerender } = renderDetails(option({}));
  expect(screen.getByText("AI credits used this month: $0.03 of $0.10")).toBeVisible();
  rerender(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FundingDetails
        option={option({ available: false, reason: "credits_insufficient", usage: null })}
      />
    </NextIntlClientProvider>,
  );
  expect(screen.getByText("There are not enough credits for this request.")).toBeVisible();
});
