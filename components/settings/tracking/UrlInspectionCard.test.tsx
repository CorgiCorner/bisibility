vi.mock("@/lib/actions/presence-settings", () => ({
  updatePresenceInspectionBudget: vi.fn(),
}));

import { UrlInspectionCard } from "@/components/settings/tracking/UrlInspectionCard";
import { renderWithTrackingSettingsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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
        "The fixed limit is 0-2000 URLs per Pacific day. All projects and explicit inspections share the property counter. Other tools also consume quota, so the counter is an estimate.",
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

it("offers available quota only on self-host deployments", async () => {
  const view = render(<UrlInspectionCard canEdit dailyLimit={50} projectId="prj_1" />);
  fireEvent.click(screen.getByRole("button", { name: "Background inspection mode" }));
  expect(screen.queryByText("Use available quota")).not.toBeInTheDocument();
  view.unmount();
  render(<UrlInspectionCard canEdit dailyLimit={50} projectId="prj_1" selfHost />);
  fireEvent.click(screen.getByRole("button", { name: "Background inspection mode" }));
  expect(await screen.findByText("Use available quota")).toBeInTheDocument();
});
