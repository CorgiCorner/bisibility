import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/actions/ai-research", () => ({ analyzeAiResearchAction: vi.fn() }));

import { AiResearchResults } from "./AiResearchResults";
import { AiResearchWorkspace } from "./AiResearchWorkspace";

describe("AI workspace product states", () => {
  it("keeps saved reports readable and disables paid actions for read-only users", () => {
    render(
      <AiResearchWorkspace
        projectId="prj_example"
        domain="acme.com"
        mode="visibility"
        canRun={false}
        history={[{ id: "agr_example", title: "Saved report", createdAt: "2026-10-02" }]}
      />,
    );
    expect(screen.getByRole("button", { name: "estimateCost" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "runAnalysis" })).toBeDisabled();
    expect(screen.getByRole("link", { name: /Saved report/ })).toHaveAttribute(
      "href",
      "/app/prj_example/agent-reports/agr_example",
    );
  });
  it("does not turn unknown-cost failed requests into a no-observations claim", () => {
    render(
      <AiResearchResults
        result={{
          evidence: "synthetic_prompt_test",
          rows: [],
          totalAvailable: null,
          truncated: true,
          failure: "unknown receipt",
          costStatus: "unknown",
          costCents: 0,
          fetchedAt: "2026-10-02",
        }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("partialFailure");
    expect(screen.queryByText("noObservations")).toBeNull();
  });
});
