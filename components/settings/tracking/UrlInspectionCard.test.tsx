import { UrlInspectionCard } from "@/components/settings/tracking/UrlInspectionCard";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("UrlInspectionCard", () => {
  it("shows the project-scoped inspection setting and shared property quota", () => {
    render(
      <UrlInspectionCard
        canEdit
        dailyLimit={200}
        projectId="prj_1"
        updateInspectionBudget={vi.fn(async () => ({}))}
      />,
    );

    expect(screen.getByText("URL inspection")).toBeInTheDocument();
    expect(
      screen.getByText("Daily Search Console index-status checks for tracked target URLs."),
    ).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Daily inspection limit" })).toHaveValue(200);
    expect(
      screen.getByText(
        "Google allows 2,000 inspections per day per property, shared across every tool using it. bisibility caps this at 1,000 to leave room for other tools sharing the property quota. URLs over the limit wait for the next day.",
      ),
    ).toBeInTheDocument();
  });

  it("saves a changed daily limit through the audited project action", async () => {
    const updateInspectionBudget = vi.fn(async () => ({}));
    render(
      <UrlInspectionCard
        canEdit
        dailyLimit={200}
        projectId="prj_1"
        updateInspectionBudget={updateInspectionBudget}
      />,
    );

    fireEvent.change(screen.getByRole("spinbutton", { name: "Daily inspection limit" }), {
      target: { value: "300" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateInspectionBudget).toHaveBeenCalledWith({
        inspectionDailyLimit: 300,
        projectId: "prj_1",
      }),
    );
  });
});
