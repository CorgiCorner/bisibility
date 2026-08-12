import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddCompetitorAction } from "./AddCompetitorAction";

vi.mock("@/components/competitors/AddCompetitorDrawer", () => ({
  AddCompetitorDrawer: ({
    onClose,
    open,
    projectId,
  }: {
    onClose: () => void;
    open: boolean;
    projectId: string;
  }) =>
    open ? (
      <div>
        <p>Drawer for {projectId}</p>
        <button onClick={onClose} type="button">
          Close competitor
        </button>
      </div>
    ) : null,
}));

describe("AddCompetitorAction", () => {
  it("opens and closes the add-competitor drawer", () => {
    render(<AddCompetitorAction canCreate projectId="project_1" />);
    const addButton = screen.getByRole("button", { name: "Add competitor" });
    expect(addButton).toHaveClass("MuiButton-sizeSmall");
    fireEvent.click(addButton);
    expect(screen.getByText("Drawer for project_1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close competitor" }));
    expect(screen.queryByText("Drawer for project_1")).not.toBeInTheDocument();
  });
});
