import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/lib/actions/ai-research", () => ({ analyzeAiResearchAction: vi.fn() }));

import { AiResearchWorkspace } from "./AiResearchWorkspace";
import { aiResearchCatalogFixture } from "./ai-research-fixtures";

const forecast = {
  ok: true,
  estimate: true,
  estimatedCostCents: 12,
  evidence: "synthetic_prompt_test",
  estimateKind: "forecast",
  forecastScope: "tokens_and_base_only",
  isPartialEstimate: true,
  isGuaranteedMaximum: false,
  credentialSource: "own",
  estimateCredentialsRef: "a".repeat(64),
  forecastAssumptions: ["Fictional forecast; excludes tool fees"],
};
function setup(analyze = vi.fn().mockResolvedValue(forecast), own = true) {
  render(
    <AiResearchWorkspace
      projectId="prj_example"
      domain="acme.com"
      mode="prompt"
      history={[]}
      catalog={{ ...aiResearchCatalogFixture, actualCostAvailable: own }}
      analyzeAction={analyze}
    />,
  );
  fireEvent.change(screen.getByLabelText("brand"), { target: { value: "Acme" } });
  fireEvent.change(screen.getByLabelText("prompt"), {
    target: { value: "Które narzędzia pomagają małym firmom?" },
  });
  return analyze;
}
function optIn() {
  fireEvent.click(screen.getByRole("button", { name: "costPolicy" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "actualCostPolicy" }));
}
async function estimate() {
  await waitFor(() => expect(screen.getByRole("button", { name: "estimateCost" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "estimateCost" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "runAnalysis" })).toBeEnabled());
}
function acknowledge() {
  fireEvent.click(screen.getByRole("checkbox", { name: "actualCostAcknowledgement" }));
}
const complete = {
  ok: true,
  estimate: false,
  cached: false,
  reportId: "agr_mock",
  costCents: 13,
  result: {
    evidence: "synthetic_prompt_test",
    rows: [],
    totalAvailable: null,
    truncated: false,
    fetchedAt: "2026-10-06",
    costCents: 13,
    costStatus: "confirmed",
    failure: null,
  },
};

describe("BYOK actual-cost opt-in", () => {
  it("keeps legacy hard-cap defaults and blocks actual-cost selection with hosted credits", () => {
    setup(undefined, false);
    expect(screen.getByRole("button", { name: "costPolicy" })).toHaveTextContent("hardCapPolicy");
    expect(screen.getByLabelText("outputTokens")).toHaveValue(512);
    expect(screen.getByText("actualCostUnavailable")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "costPolicy" }));
    expect(screen.getByRole("menuitem", { name: "actualCostPolicy" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.queryByRole("checkbox", { name: "actualCostAcknowledgement" })).toBeNull();
  });
  it("scopes own-credential and saved-replay hints to actual cost and restores the hard-cap cache hint", () => {
    setup();
    expect(screen.queryByText("actualCostOwnCredentials")).toBeNull();
    expect(screen.queryByText("actualReplayHint")).toBeNull();
    expect(screen.getByText("cacheHint")).toBeVisible();
    optIn();
    expect(screen.getByText("actualCostOwnCredentials")).toBeVisible();
    expect(screen.getByText("actualReplayHint")).toBeVisible();
    expect(screen.queryByText("cacheHint")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "costPolicy" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "hardCapPolicy" }));
    expect(screen.queryByText("actualCostOwnCredentials")).toBeNull();
    expect(screen.queryByText("actualReplayHint")).toBeNull();
    expect(screen.getByText("cacheHint")).toBeVisible();
  });
  it("requires explicit consent and sends separate advisory limits and bound credentials", async () => {
    const analyze = setup(vi.fn().mockResolvedValueOnce(forecast).mockResolvedValueOnce(complete));
    optIn();
    expect(screen.getByRole("checkbox", { name: "actualCostAcknowledgement" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "estimateCost" })).toBeDisabled();
    acknowledge();
    fireEvent.change(screen.getByLabelText("outputTokens"), { target: { value: "4096" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "webSearch" }));
    expect(screen.getByRole("button", { name: "searchCountry" })).toHaveTextContent(
      "United States",
    );
    await estimate();
    expect(analyze.mock.calls[0][2]).toMatchObject({
      cost_policy: "provider_actual_cost",
      actual_cost_acknowledgement: "non_guaranteed_estimate_v1",
      estimated_cost_limit_cents: 60,
      max_output_tokens: 4096,
      web_search: true,
    });
    expect(analyze.mock.calls[0][2]).not.toHaveProperty("max_cost_cents");
    expect(screen.getByText("actualCostForecast")).toBeVisible();
    expect(screen.queryByText("conservativeBound")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "runAnalysis" }));
    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(2));
    expect(analyze.mock.calls[1][2]).toMatchObject({
      estimate_only: false,
      estimate_credentials_ref: "a".repeat(64),
      idempotency_key: expect.stringMatching(/^[a-f0-9-]{36}$/),
    });
    expect(analyze.mock.calls[1][2]).not.toHaveProperty("max_cost_cents");
  });
  it("enables catalog reasoning models only in explicit actual-cost mode and applies output bounds", () => {
    setup();
    optIn();
    acknowledge();
    fireEvent.click(screen.getByRole("button", { name: "firstModel" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Reasoning example/ }));
    expect(screen.getByLabelText("outputTokens")).toHaveValue(1024);
    expect(screen.getByRole("checkbox", { name: "webSearch" })).toBeDisabled();
  });
  it.each([
    { credentialSource: "hosted" },
    { isGuaranteedMaximum: true },
    { forecastScope: undefined },
    { isPartialEstimate: false },
  ])("rejects a forecast with invalid source or pricing scope %j", async (invalid) => {
    setup(vi.fn().mockResolvedValue({ ...forecast, ...invalid }));
    optIn();
    acknowledge();
    fireEvent.click(screen.getByRole("button", { name: "estimateCost" }));
    await waitFor(() => expect(screen.getByText("actualCostForecast")).toBeVisible());
    expect(screen.getByRole("button", { name: "runAnalysis" })).toBeDisabled();
  });
  it.each(["timeout", "unknown receipt"])(
    "prevents another paid attempt after %s, including edited advisory limits",
    async (failure) => {
      const analyze = setup(
        vi.fn().mockResolvedValueOnce(forecast).mockRejectedValueOnce(new Error(failure)),
      );
      optIn();
      acknowledge();
      await estimate();
      fireEvent.click(screen.getByRole("button", { name: "runAnalysis" }));
      await waitFor(() => expect(screen.getByText("actualCostUsageReview")).toBeVisible());
      fireEvent.change(screen.getByLabelText("estimatedCostLimit"), { target: { value: "99" } });
      fireEvent.click(screen.getByRole("button", { name: "estimateCost" }));
      fireEvent.click(screen.getByRole("button", { name: "runAnalysis" }));
      expect(analyze).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("button", { name: "estimateCost" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "runAnalysis" })).toBeDisabled();
      expect(screen.queryByRole("button", { name: "newRequest" })).toBeNull();
    },
  );
  it("requires explicit new request and fresh UUID after a reserved credential-rotation refusal", async () => {
    const analyze = setup(
      vi
        .fn()
        .mockResolvedValueOnce(forecast)
        .mockResolvedValueOnce({
          ok: false,
          reason: "credentials_changed",
          message: "Changed",
          safeToStartNewRequest: true,
        })
        .mockResolvedValueOnce({ ...forecast, estimateCredentialsRef: "b".repeat(64) })
        .mockResolvedValueOnce(complete),
    );
    optIn();
    acknowledge();
    await estimate();
    fireEvent.click(screen.getByRole("button", { name: "runAnalysis" }));
    await waitFor(() => expect(screen.getByText("credentialsChanged")).toBeVisible());
    await waitFor(() => expect(screen.getByRole("button", { name: "newRequest" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "runAnalysis" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "estimateCost" })).toBeDisabled();
    expect(analyze).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "newRequest" }));
    await estimate();
    fireEvent.click(screen.getByRole("button", { name: "runAnalysis" }));
    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(4));
    expect(analyze.mock.calls[3][2]).toMatchObject({
      estimate_credentials_ref: "b".repeat(64),
    });
    expect(analyze.mock.calls[3][2].idempotency_key).not.toBe(
      analyze.mock.calls[1][2].idempotency_key,
    );
  });
  it.each([{}, { safeToStartNewRequest: true, retryBlocked: true }])(
    "keeps an unproven credential refusal locked %j",
    async (flags) => {
      const analyze = setup(
        vi
          .fn()
          .mockResolvedValueOnce(forecast)
          .mockResolvedValueOnce({
            ok: false,
            reason: "credentials_changed",
            message: "Unproven refusal",
            ...flags,
          }),
      );
      optIn();
      acknowledge();
      await estimate();
      fireEvent.click(screen.getByRole("button", { name: "runAnalysis" }));
      await waitFor(() => expect(screen.getByText("actualCostUsageReview")).toBeVisible());
      expect(screen.getByRole("button", { name: "estimateCost" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "runAnalysis" })).toBeDisabled();
      expect(screen.queryByRole("button", { name: "newRequest" })).toBeNull();
      expect(analyze).toHaveBeenCalledTimes(2);
    },
  );
  it("blocks execution after consent is revoked and when the advisory forecast exceeds its limit", async () => {
    const analyze = setup(vi.fn().mockResolvedValue(forecast));
    optIn();
    acknowledge();
    await estimate();
    acknowledge();
    expect(screen.getByRole("button", { name: "runAnalysis" })).toBeDisabled();
    acknowledge();
    fireEvent.change(screen.getByLabelText("estimatedCostLimit"), { target: { value: "11" } });
    fireEvent.click(screen.getByRole("button", { name: "estimateCost" }));
    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "runAnalysis" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("estimateAboveCap");
  });
  it("blocks retries when the server returns an unknown receipt with a saved report", async () => {
    const analyze = setup(
      vi
        .fn()
        .mockResolvedValueOnce(forecast)
        .mockResolvedValueOnce({
          ...complete,
          retryBlocked: true,
          result: {
            ...complete.result,
            costStatus: "unknown",
            failure: "Unknown provider receipt",
          },
        }),
    );
    optIn();
    acknowledge();
    await estimate();
    fireEvent.click(screen.getByRole("button", { name: "runAnalysis" }));
    await waitFor(() => expect(screen.getByText("actualCostUsageReview")).toBeVisible());
    expect(screen.getByRole("button", { name: "runAnalysis" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "newRequest" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "runAnalysis" }));
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("link", { name: "openReport" })).toHaveAttribute(
      "href",
      "/app/prj_example/agent-reports/agr_mock",
    );
  });
  it("permits a new UUID only after explicit action for a proven no-dispatch refusal", async () => {
    const analyze = setup(
      vi
        .fn()
        .mockResolvedValueOnce(forecast)
        .mockResolvedValueOnce({
          ok: false,
          reason: "cost_limit_exceeded",
          message: "Refused before dispatch",
          safeToStartNewRequest: true,
        })
        .mockResolvedValueOnce(forecast)
        .mockResolvedValueOnce(complete),
    );
    optIn();
    acknowledge();
    await estimate();
    fireEvent.click(screen.getByRole("button", { name: "runAnalysis" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "newRequest" })).toBeVisible());
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "runAnalysis" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "estimateCost" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "newRequest" }));
    await estimate();
    fireEvent.click(screen.getByRole("button", { name: "runAnalysis" }));
    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(4));
    expect(analyze.mock.calls[3][2].idempotency_key).not.toBe(
      analyze.mock.calls[1][2].idempotency_key,
    );
  });
  it("requires an explicit new request after confirmed completion before generating another UUID", async () => {
    const analyze = setup(
      vi
        .fn()
        .mockResolvedValueOnce(forecast)
        .mockResolvedValueOnce(complete)
        .mockResolvedValueOnce(forecast)
        .mockResolvedValueOnce(complete),
    );
    optIn();
    acknowledge();
    await estimate();
    fireEvent.click(screen.getByRole("button", { name: "runAnalysis" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "newRequest" })).toBeVisible());
    expect(screen.getByRole("button", { name: "estimateCost" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "newRequest" }));
    await estimate();
    fireEvent.click(screen.getByRole("button", { name: "runAnalysis" }));
    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(4));
    expect(analyze.mock.calls[3][2].idempotency_key).not.toBe(
      analyze.mock.calls[1][2].idempotency_key,
    );
  });
});
