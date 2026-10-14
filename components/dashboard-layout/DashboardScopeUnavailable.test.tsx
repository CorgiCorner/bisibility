import { ProjectDashboardMessages } from "@/components/overview/ProjectDashboardMessages";
import { comparisonProject } from "@/lib/dashboard-competitors/fixture";
import { composeDashboardLayout } from "@/lib/dashboard-layout/compose";
import { presetDashboardLayout } from "@/lib/dashboard-layout/layout";
import type { DashboardAccess } from "@/lib/dashboard-layout/types";
import type { loadDashboardPersonalContext } from "@/lib/queries/dashboard-personal-context";
import dashboardMessages from "@/messages/core/en/project-dashboard.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { DashboardScopeUnavailable } from "./DashboardScopeUnavailable";

const actions = vi.hoisted(() => ({ save: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/project-surface-preferences/dashboard-actions", () => ({
  saveDashboardComparisonSelection: actions.save,
  readDashboardPreference: actions.read,
}));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: async () => ({ locale: "en", timeZone: "UTC" }),
}));
vi.mock("@/i18n/catalog-loader.server", () => ({
  loadCoreMessages: async () => ({ ...sharedMessages, ...dashboardMessages }),
}));
vi.mock("./PersonalDashboardSurface", () => ({
  PersonalDashboardSurface: ({ emptyState }: { emptyState: ReactNode }) => <div>{emptyState}</div>,
}));

function personal(): Awaited<ReturnType<typeof loadDashboardPersonalContext>> {
  const layout = presetDashboardLayout("competitors");
  const access: DashboardAccess = {
    projectId: comparisonProject.publicId,
    projectReadAuthorized: true,
    competitorsReadAuthorized: true,
    capabilities: [],
  };
  return {
    preference: {
      projectId: comparisonProject.publicId,
      revision: 7,
      defaultPreset: "general",
      presentation: { schemaVersion: 1, layouts: {} },
    },
    comparison: { state: "missing", choices: [], selection: null, report: null },
    local: null,
    invalidPreset: false,
    scopeKey: "empty-competitors",
    access,
    composition: composeDashboardLayout(layout, access),
  };
}

it("replaces the centered scope wrapper with one canonical setup empty state", async () => {
  render(
    <ProjectDashboardMessages>
      {await DashboardScopeUnavailable({ personal: personal() })}
    </ProjectDashboardMessages>,
  );
  expect(screen.getByRole("heading", { name: "No saved comparisons" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Competitors" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Set up comparison" })).toHaveAttribute(
    "href",
    `/app/${comparisonProject.publicId}/competitors`,
  );
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Competitor comparison" })).not.toBeInTheDocument();
  expect(
    screen.queryByText("Select an explicit competitor comparison scope."),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/No broader scope/)).not.toBeInTheDocument();
  expect(actions.save).not.toHaveBeenCalled();
  expect(actions.read).not.toHaveBeenCalled();
});
