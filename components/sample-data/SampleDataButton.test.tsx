import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SAMPLE_DATA_BUTTON_TOOLTIP, SampleDataButton } from "./SampleDataButton";

vi.mock("@/lib/actions/sample-data", () => ({
  installSampleData: vi.fn(),
}));

describe("SampleDataButton", () => {
  it("puts the skip-setup help on the action button itself", () => {
    render(<SampleDataButton help={SAMPLE_DATA_BUTTON_TOOLTIP} variant="secondary" />);

    const button = screen.getByRole("button", { name: "Load sample project" });
    expect(button).toHaveAttribute("data-variant", "secondary");
    const describedBy = button.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? "")).toHaveTextContent(
      SAMPLE_DATA_BUTTON_TOOLTIP,
    );
    expect(
      screen.queryByRole("button", { name: SAMPLE_DATA_BUTTON_TOOLTIP }),
    ).not.toBeInTheDocument();
  });

  it("navigates to the installed sample project without rendering an action error", async () => {
    const destination = "/app/prj_e00000000000000000000000/dashboard";
    const action = vi.fn(async () => ({ destination }));
    render(<SampleDataButton action={action} />);

    fireEvent.click(screen.getByRole("button", { name: "Load sample project" }));

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith(destination));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/NEXT_REDIRECT/)).not.toBeInTheDocument();
  });

  it("renders genuine action failures", async () => {
    const action = vi.fn(async () => {
      throw new Error("Database unavailable");
    });
    render(<SampleDataButton action={action} />);

    fireEvent.click(screen.getByRole("button", { name: "Load sample project" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable");
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("omits the help control when no help is provided", () => {
    render(<SampleDataButton />);

    expect(screen.getByRole("button", { name: "Load sample project" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: SAMPLE_DATA_BUTTON_TOOLTIP }),
    ).not.toBeInTheDocument();
  });
});
