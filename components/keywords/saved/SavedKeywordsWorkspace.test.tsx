import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SavedKeywordsWorkspace } from "./SavedKeywordsWorkspace";

vi.mock("./SavedKeywordsTable", () => ({
  SavedKeywordsTable: ({ onCountChange }: { onCountChange: (count: number) => void }) => (
    <button onClick={() => onCountChange(0)} type="button">
      Complete tracked promotion
    </button>
  ),
}));

describe("SavedKeywordsWorkspace", () => {
  it("decrements the Saved count when the table consumes tracked rows", () => {
    render(
      <SavedKeywordsWorkspace
        addKeywordsAction={vi.fn()}
        canCreateKeyword
        canDeleteKeyword
        costContext={{} as never}
        defaultDevice="desktop"
        initialSavedCount={3}
        projectId="prj_1"
        removeSavedKeywordsAction={vi.fn()}
        rows={[]}
        trackedCount={12}
      />,
    );

    expect(screen.getByRole("link", { name: "Saved 3" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Complete tracked promotion" }));
    expect(screen.getByRole("link", { name: "Saved 0" })).toBeInTheDocument();
  });
});
