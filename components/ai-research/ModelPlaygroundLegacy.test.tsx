import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import { entities } from "@/lib/model-playground/result-fixtures.test-support";
import {
  projectLegacyColumn,
  resultMatrix,
  resultMatrixCsv,
} from "@/lib/model-playground/result-view";
import aiMessages from "@/messages/core/en/project-ai-research.json";
import trackingMessages from "@/messages/core/en/project-ai-tracking.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModelPlaygroundResults } from "./ModelPlaygroundResults";

vi.mock("@/lib/actions/ai-tracking", () => ({ mutateAiTrackingAction: vi.fn() }));
vi.mock("./ModelPlaygroundHistory", () => ({ ModelPlaygroundHistoryButton: () => null }));
const legacy = (answer = "Acme is mentioned", url = "https://acme.example/docs") => ({
  id: "legacy",
  label: "Legacy model",
  model: "older-model",
  answer,
  citations: [{ url, title: "Source", targetDomain: true }],
  failed: false,
  observedAt: "2026-11-10T12:00:00Z",
});
function render(
  answer: string | null = "Acme is mentioned",
  url?: string,
  truncated = false,
  count = 1,
) {
  const quote = paymentQuote({
    charge: { value: "1.23", certainty: "measured", unit: { kind: "currency", code: "USD" } },
  });
  return renderWithFeatureMessages(
    <ModelPlaygroundResults
      canTrack={false}
      columns={Array.from({ length: count }, (_, i) => ({
        id: i ? `legacy-${i}` : "legacy",
        label: i ? `Legacy model ${i + 1}` : "Legacy model",
        model: "older-model",
      }))}
      entities={entities}
      funding="byok"
      onRemove={vi.fn()}
      projectId="prj_test"
      prompt="test"
      running={false}
      topics={[]}
      unfinished={false}
      payment={{
        option: quote.option,
        charge: quote.charge,
        state: "settled",
        actionId: "action-1",
        quoteId: quote.id,
      }}
      sourceContext={{
        competitorDomains: [],
        excludedNames: [],
        overrides: [],
        ownDomain: "acme.example",
      }}
      result={{
        rows:
          answer === null
            ? []
            : Array.from({ length: count }, (_, i) => ({
                ...legacy(answer, url),
                model: i ? `legacy-${i}` : "legacy",
                prompt: "test",
                brandMentioned: true,
                domainCited: true,
                contentTruncated: truncated,
              })),
        failure: null,
        costCents: 123,
        costStatus: "confirmed",
        evidence: "synthetic_prompt_test",
        fetchedAt: "2026-11-10T12:00:00Z",
        totalAvailable: null,
        truncated: false,
      }}
    />,
    { messages: { ...sharedMessages, ...trackingMessages, ...aiMessages } },
  );
}
describe("legacy parity with base 771ff58", () => {
  it.each([
    ["acme.example/docs", ["acme.example"]],
    ["www.x.com", ["x.com"]],
    ["", []],
  ] as const)("R1 renders malformed citation %j without losing the answer", (url, domains) => {
    render("Acme is mentioned", url);
    expect(screen.getByRole("article")).toHaveTextContent("Acme is mentioned");
    const sources = screen.getByRole("heading", { name: "Sources" }).parentElement;
    expect(sources).toBeInTheDocument();
    expect(sources?.querySelectorAll(":scope > div")).toHaveLength(domains.length);
    for (const domain of domains) expect(within(sources!).getByText(domain)).toBeInTheDocument();
  });
  it("R2 explains a missing terminal legacy row", () => {
    render(null);
    expect(screen.getByRole("alert")).toHaveTextContent(
      aiMessages.projectAiResearch.partialFailure,
    );
  });
  it.each([
    [4000, false],
    [20, true],
  ] as const)("N1 names the retained legacy excerpt (%i, %s)", async (length, marker) => {
    render("z".repeat(length), undefined, marker);
    await userEvent.click(screen.getByRole("button", { name: "Full retained answer" }));
    expect(screen.getByRole("dialog", { name: "Full retained answer" })).toHaveTextContent(
      "full answer was not retained",
    );
  });
  it("N1 keeps base wording for a complete legacy answer", async () => {
    render();
    await userEvent.click(screen.getByRole("button", { name: "Full answer" }));
    expect(screen.getByRole("dialog", { name: "Full answer" })).toBeInTheDocument();
  });
  it("N4 shows a settled receipt when every legacy column failed", () => {
    render(null);
    expect(document.querySelector("[data-legacy-run-charge]")).toHaveTextContent("$1.23");
  });
  it.each([
    [3999, false, false],
    [4000, false, true],
    [20, true, true],
  ] as const)("R3 classifies length %i marker %s", async (length, marker, excerpt) => {
    render("z".repeat(length), "https://other.example/docs", marker);
    expect(document.querySelector("[data-column-verdict]")).toHaveTextContent(
      excerpt ? "Unknown" : aiMessages.projectAiResearch.modelPlayground.verdictAbsent,
    );
    expect(document.querySelector("[data-cell-kind]")).toHaveAttribute(
      "data-cell-kind",
      excerpt ? "unknown" : "not_named",
    );
    await userEvent.click(screen.getByRole("button", { name: /Full (retained )?answer/ }));
    expect(
      Boolean(within(screen.getByRole("dialog")).queryByText(/full answer was not retained/)),
    ).toBe(excerpt);
  });
  it("R4 omits unsupported legacy API provenance in cards, matrix and CSV", () => {
    render();
    expect(screen.queryByText("API response")).not.toBeInTheDocument();
    const column = projectLegacyColumn(legacy());
    expect(
      resultMatrixCsv([column], resultMatrix([column], entities), (cell) => cell.kind),
    ).not.toContain("API response");
  });
  it("R5 preserves base funding, run charge and source classification", async () => {
    render("Acme is mentioned", undefined, false, 2);
    expect(screen.getAllByText("Your key")[0]).toBeInTheDocument();
    expect(screen.getAllByText(/\$1\.23/)).toHaveLength(1);
    expect(screen.getByText("Run cost", { exact: false })).toBeInTheDocument();
    expect(document.querySelector("[data-column-cost]")).toBeNull();
    expect(screen.queryByText("Usage and cost details")).not.toBeInTheDocument();
    expect(screen.getAllByText(trackingMessages.projectAiTracking.sources.type.you)).toHaveLength(
      2,
    );
    await userEvent.click(screen.getByRole("radio", { name: "Sources" }));
    expect(screen.getByText("All 1")).toBeInTheDocument();
    expect(screen.getByText("Legacy model, Legacy model 2")).toBeInTheDocument();
    expect(
      screen.getByText(trackingMessages.projectAiTracking.sources.type.you),
    ).toBeInTheDocument();
  });
  it("R10 omits settings without a callback", () => {
    render();
    expect(screen.queryByRole("button", { name: /Settings/ })).not.toBeInTheDocument();
  });
});
