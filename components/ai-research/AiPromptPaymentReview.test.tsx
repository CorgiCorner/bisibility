import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useFormatter: () => ({ dateTime: (value: unknown) => String(value) }),
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/lib/actions/ai-research", () => ({ analyzeAiResearchAction: vi.fn() }));

import { AiResearchWorkspace } from "./AiResearchWorkspace";
import { aiResearchCatalogFixture } from "./ai-research-fixtures";

it("reviews the free estimate in a modal and cancels without a paid request", async () => {
  const analyze = vi.fn().mockResolvedValue({
    ok: true,
    estimate: true,
    payment: paymentQuote(),
    estimatedCostCents: 1,
    evidence: "synthetic_prompt_test",
  });
  render(
    <AiResearchWorkspace
      projectId="prj_test"
      domain="example.com"
      mode="prompt"
      history={[]}
      catalog={aiResearchCatalogFixture}
      analyzeAction={analyze}
    />,
  );
  fireEvent.change(screen.getByLabelText("brand"), { target: { value: "Example" } });
  fireEvent.change(screen.getByLabelText("prompt"), {
    target: { value: "Which tools help businesses?" },
  });
  expect(screen.queryByRole("button", { name: /^runAnalysis/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "estimateCost" }));
  const dialog = await screen.findByRole("dialog");
  await waitFor(() =>
    expect(within(dialog).getByRole("button", { name: "runAnalysis" })).toBeEnabled(),
  );
  expect(analyze).toHaveBeenCalledOnce();
  expect(analyze.mock.calls[0][2]).toMatchObject({ estimate_only: true });
  expect(within(dialog).getByText("≈ 4 tokens")).toBeVisible();
  fireEvent.click(within(dialog).getByRole("button", { name: "cancel" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(analyze).toHaveBeenCalledOnce();
});

it("uses the reviewed quote only once when confirmation is clicked twice", async () => {
  const quote = paymentQuote();
  const analyze = vi.fn().mockResolvedValue({
    ok: true,
    estimate: true,
    payment: quote,
    estimatedCostCents: 1,
    evidence: "synthetic_prompt_test",
  });
  render(
    <AiResearchWorkspace
      projectId="prj_test"
      domain="example.com"
      mode="prompt"
      history={[]}
      catalog={aiResearchCatalogFixture}
      analyzeAction={analyze}
    />,
  );
  fireEvent.change(screen.getByLabelText("brand"), { target: { value: "Example" } });
  fireEvent.change(screen.getByLabelText("prompt"), {
    target: { value: "Which tools help businesses?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "estimateCost" }));
  const dialog = await screen.findByRole("dialog");
  const confirm = within(dialog).getByRole("button", { name: "runAnalysis" });
  await waitFor(() => expect(confirm).toBeEnabled());
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  await waitFor(() => expect(analyze).toHaveBeenCalledTimes(2));
  expect(analyze.mock.calls[1][2]).toMatchObject({
    estimate_only: false,
    accepted_payment: { quote_token: quote.quoteToken },
  });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
