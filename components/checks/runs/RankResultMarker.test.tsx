import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { EvidenceProjection } from "@/lib/provider-evidence/projection/model";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RankResultMarker } from "./RankResultMarker";

const evidence: EvidenceProjection = {
  acceptance: "accepted",
  fulfillment: "partial",
  returnedDepth: 20,
  accounting: "unknown",
  result: "partial",
  cost: "unknown",
  recovery: null,
  originalCheckedAt: "2026-10-20T06:00:00Z",
};
describe("UI-6 result markers", () => {
  it("marks partial positions with the actual checked depth", () => {
    render(<RankResultMarker evidence={evidence} position={7} />);
    expect(screen.getByText("Position 7")).toBeVisible();
    expect(screen.getByText("Incomplete · to #20")).toBeVisible();
  });
  it("does not claim a partial no-match is absent from the full configured depth", () => {
    render(<RankResultMarker evidence={evidence} position={null} />);
    expect(screen.getByText("No match in incomplete results")).toBeVisible();
    expect(screen.queryByText(/not in top 100/i)).toBeNull();
  });
  it.each(["measured", "unknown"] as const)(
    "shows recovered original time with %s cost and no alert affordance",
    (cost) => {
      render(
        <RankResultMarker
          evidence={{ ...evidence, result: "recovered", fulfillment: "complete", cost }}
          position={7}
        />,
      );
      expect(screen.getByText(/Original check: Oct 20, 2026/)).toBeVisible();
      expect(screen.queryByRole("button")).toBeNull();
      expect(screen.queryByText("Cost remains unknown") !== null).toBe(cost === "unknown");
    },
  );
  it("leaves unrelated legacy state untouched", () => {
    const { container } = render(
      <RankResultMarker evidence={{ ...evidence, result: null }} position={7} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
