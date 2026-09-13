import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StoredKeywordResearchView } from "./StoredKeywordResearchView";

vi.mock("@/components/research/ResearchResults", () => ({
  ResearchResults: (props: { readOnly: boolean; result: { rows: unknown[] } }) => (
    <output data-testid="research-results">{JSON.stringify(props)}</output>
  ),
}));

describe("StoredKeywordResearchView", () => {
  it("renders truthful empty copy without manufacturing a result", () => {
    render(<StoredKeywordResearchView result={null} />);
    expect(screen.getByText(/No saved keyword research results/i)).toBeInTheDocument();
  });

  it("makes stored rows read-only", () => {
    render(
      <StoredKeywordResearchView
        result={
          {
            fetchedAt: "2026-08-01T10:00:00.000Z",
            freshUntil: "2026-08-31T10:00:00.000Z",
            resultLimit: 100,
            rows: [],
            seed: "ergonomic desk",
            stale: true,
          } as never
        }
      />,
    );
    expect(screen.getByTestId("research-results")).toHaveTextContent('"readOnly":true');
  });
});
