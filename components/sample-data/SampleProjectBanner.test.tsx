import { iconWellClassName, ToastProvider } from "@/components/ui";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SampleProjectBanner } from "./SampleProjectBanner";

const mocks = vi.hoisted(() => ({
  removeSampleData: vi.fn(),
}));

vi.mock("@/lib/actions/sample-data", () => ({
  removeSampleData: mocks.removeSampleData,
}));

function renderBanner() {
  return render(
    <ToastProvider>
      <SampleProjectBanner projectId="prj_sample" />
    </ToastProvider>,
  );
}

describe("SampleProjectBanner", () => {
  beforeEach(() => {
    mocks.removeSampleData.mockReset();
    mocks.removeSampleData.mockResolvedValue({ projectId: "prj_sample", publicId: "prj_sample" });
  });

  it("uses the same title-to-detail gap as FirstCheckBanner", () => {
    renderBanner();

    expect(
      screen.getByText("The rankings, traffic, and timeline events here are generated demo data."),
    ).toHaveClass("mt-0.5");
  });

  it("uses a quiet icon well instead of a primary fill tile", () => {
    const { container } = renderBanner();
    const well = container.querySelector("section > span");

    expect(well).toHaveClass(...iconWellClassName.split(" "));
    expect(well).not.toHaveClass("bg-accent-solid");
  });

  it("opens a confirmation modal instead of relabeling the banner button", () => {
    renderBanner();

    const trigger = screen.getByRole("button", { name: "Remove sample data" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Remove sample data" })).toBeInTheDocument();
    expect(
      within(dialog).getByText(/deletes the sample project and its generated demo data/i),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/rankings, traffic, and timeline/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm removal" })).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent("Remove sample data");
  });

  it("cancels without calling the remove action", async () => {
    renderBanner();

    fireEvent.click(screen.getByRole("button", { name: "Remove sample data" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    expect(mocks.removeSampleData).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("removes sample data after modal confirm and leaves the sample project", async () => {
    renderBanner();

    fireEvent.click(screen.getByRole("button", { name: "Remove sample data" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Remove sample data" }),
    );

    await waitFor(() =>
      expect(mocks.removeSampleData).toHaveBeenCalledWith({ projectId: "prj_sample" }),
    );
    expect(routerMock.push).toHaveBeenCalledWith("/app/prj_sample/dashboard");
    expect(routerMock.refresh).toHaveBeenCalled();
  });
});
