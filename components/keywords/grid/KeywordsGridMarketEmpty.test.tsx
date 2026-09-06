import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeywordsGridMarketEmpty } from "./KeywordsGridMarketEmpty";

function renderEmpty(overrides: { canCreateKeyword?: boolean } = {}) {
  const onAddKeyword = vi.fn();
  render(
    <ProjectWriteModeProvider projectRef="prj_1" writeMode="active">
      <KeywordsGridMarketEmpty
        canCreateKeyword={overrides.canCreateKeyword ?? true}
        dialogs={null}
        marketLabel="Germany / German"
        onAddKeyword={onAddKeyword}
        projectRef="prj_1"
      />
    </ProjectWriteModeProvider>,
  );
  return { onAddKeyword };
}

describe("KeywordsGridMarketEmpty", () => {
  it("says the market is empty in that market's own terms", () => {
    renderEmpty();

    expect(
      screen.getByRole("heading", { name: "No keywords in Germany / German yet" }),
    ).toBeInTheDocument();
  });

  it("offers a primary way into this market and a quieter way in from another", () => {
    const { onAddKeyword } = renderEmpty();

    const add = screen.getByRole("button", { name: "Add keywords to Germany / German" });
    expect(add).toHaveClass("MuiButton-contained");
    fireEvent.click(add);
    expect(onAddKeyword).toHaveBeenCalledOnce();

    const copy = screen.getByRole("link", { name: "Copy keywords from another market" });
    expect(copy).toHaveAttribute("href", "/app/prj_1/rank-tracker");
    expect(copy).not.toHaveClass("MuiButton-contained");
  });

  it("keeps the way in from another market when this reader cannot create keywords", () => {
    renderEmpty({ canCreateKeyword: false });

    expect(
      screen.queryByRole("button", { name: "Add keywords to Germany / German" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Copy keywords from another market" }),
    ).toBeInTheDocument();
  });
});
