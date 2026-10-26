vi.mock("@/lib/actions/presence-settings", () => ({
  updatePresenceInspectionBudget: vi.fn(),
}));

import { UrlInspectionCard } from "@/components/settings/tracking/UrlInspectionCard";
import { renderWithTrackingSettingsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("UrlInspectionCard", () => {
  it("enables Save after changing the inspection mode", async () => {
    const updateInspectionBudget = vi.fn(async () => ({}));
    render(
      <UrlInspectionCard
        canEdit
        dailyLimit={50}
        projectId="prj_1"
        updateInspectionBudget={updateInspectionBudget}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Background inspection mode" }));
    fireEvent.click(await screen.findByText("Use available quota"));
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(updateInspectionBudget).toHaveBeenCalledWith({
        inspectionDailyLimit: 50,
        inspectionBudgetMode: "available_quota",
        projectId: "prj_1",
      }),
    );
  });

  it("shows the project-scoped inspection setting and shared property quota", () => {
    render(
      <UrlInspectionCard
        canEdit
        dailyLimit={200}
        projectId="prj_1"
        updateInspectionBudget={vi.fn(async () => ({}))}
      />,
    );

    expect(screen.getByText("Background inspection mode")).toBeVisible();
    expect(screen.getByText("URL inspection")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Build a partial Page indexing report from Google's stored indexed state, not a live test.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Daily inspection limit" })).toHaveValue(200);
    expect(
      screen.getByText(
        "Quota is shared across projects and tools. It resets at midnight Pacific time. Remaining quota is an estimate.",
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
        inspectionBudgetMode: "fixed",
        projectId: "prj_1",
      }),
    );
  });

  it("shows a read-only inspection limit without Save", () => {
    render(
      <UrlInspectionCard
        canEdit={false}
        dailyLimit={200}
        projectId="prj_1"
        updateInspectionBudget={vi.fn(async () => ({}))}
      />,
    );

    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
});

it("offers available quota without a deployment-specific restriction", async () => {
  render(<UrlInspectionCard canEdit dailyLimit={50} projectId="prj_1" />);
  fireEvent.click(screen.getByRole("button", { name: "Background inspection mode" }));
  expect(await screen.findByText("Use available quota")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Use available quota"));
  expect(
    screen.queryByRole("spinbutton", { name: "Daily inspection limit" }),
  ).not.toBeInTheDocument();
});
