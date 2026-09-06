import { TagChip } from "@/components/ui/TagChip";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

describe("TagChip", () => {
  it("renders usage counts when keywords use the tag", () => {
    render(<TagChip keywordCount={12} label="Docs" />);
    expect(screen.getByText("Docs", { exact: false })).toBeVisible();
    expect(screen.getByText("12", { exact: false })).toBeVisible();
  });

  it("calls remove when the dismiss control is clicked", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<TagChip keywordCount={0} label="Docs" onRemove={onRemove} />);

    await user.click(screen.getByRole("button", { name: "Remove Docs" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
