import { FIELD_HELP } from "@/lib/settings/field-help";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PresenceInspectionBudget } from "./PresenceInspectionBudget";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("PresenceInspectionBudget", () => {
  it("shows rotation math and the property-wide quota context", () => {
    render(<PresenceInspectionBudget dailyLimit={50} projectId="prj_1" targetUrlCount={51} />);

    expect(
      screen.getByText(
        "51 tracked target URLs at limit 50 -> each URL is re-inspected every 2 days.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/2,000 inspections\/day per property/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: FIELD_HELP.inspectionDailyLimit }),
    ).toBeInTheDocument();
  });

  it("submits zero as an explicit disabled state", async () => {
    const updateBudget = vi.fn(async () => ({}));
    render(
      <PresenceInspectionBudget
        dailyLimit={50}
        projectId="prj_1"
        targetUrlCount={10}
        updateBudget={updateBudget}
      />,
    );

    fireEvent.change(screen.getByRole("spinbutton", { name: "Daily inspection limit" }), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateBudget).toHaveBeenCalledWith({ inspectionDailyLimit: 0, projectId: "prj_1" }),
    );
    expect(screen.getByText(/index-status checks are disabled/)).toBeInTheDocument();
  });
});
