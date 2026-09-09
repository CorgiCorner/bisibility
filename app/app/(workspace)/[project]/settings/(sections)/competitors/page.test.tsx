import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  CompetitorSetTable: vi.fn(),
  getCompetitorSetSettings: vi.fn(),
  requireReadableProject: vi.fn(),
}));

vi.mock("@/components/competitors/set/CompetitorSetTable", () => ({
  CompetitorSetTable: mocks.CompetitorSetTable,
}));
vi.mock("@/components/settings/shell/SettingsShell", () => ({
  SettingsShell: ({ children, projectRef }: { children: ReactNode; projectRef: string }) => (
    <main data-project-ref={projectRef}>{children}</main>
  ),
}));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("@/lib/queries/competitor-set-settings", () => ({
  getCompetitorSetSettings: mocks.getCompetitorSetSettings,
}));

import CompetitorsSettingsPage from "./page";

describe("CompetitorsSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({
      actor: { memberships: [{ projectId: "project_1", role: "member" }] },
      project: { id: "project_1", publicId: "prj_abcdefghijklmnopqrstuvwx", writeMode: "active" },
    });
    mocks.getCompetitorSetSettings.mockResolvedValue({ competitors: [], markets: [] });
    mocks.CompetitorSetTable.mockImplementation(() => <div data-competitor-table="" />);
  });

  it("loads the scoped edit model after server-side project access", async () => {
    render(
      await CompetitorsSettingsPage({ params: Promise.resolve({ project: "prj_untrusted" }) }),
    );

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_untrusted");
    expect(mocks.getCompetitorSetSettings).toHaveBeenCalledWith("project_1");
    expect(screen.getByRole("main")).toHaveAttribute(
      "data-project-ref",
      "prj_abcdefghijklmnopqrstuvwx",
    );
    expect(mocks.CompetitorSetTable).toHaveBeenCalledWith(
      expect.objectContaining({
        canDelete: false,
        canEdit: true,
        projectId: "prj_abcdefghijklmnopqrstuvwx",
      }),
      undefined,
    );
  });

  it("does not make the table writable for a viewer", async () => {
    mocks.requireReadableProject.mockResolvedValue({
      actor: { memberships: [{ projectId: "project_1", role: "viewer" }] },
      project: { id: "project_1", publicId: "prj_abcdefghijklmnopqrstuvwx", writeMode: "active" },
    });

    render(await CompetitorsSettingsPage({ params: Promise.resolve({ project: "prj_viewer" }) }));

    expect(mocks.CompetitorSetTable).toHaveBeenCalledWith(
      expect.objectContaining({ canDelete: false, canEdit: false }),
      undefined,
    );
  });
});

it("shows removal for admins and disables all mutations for a read-only project", async () => {
  for (const writeMode of ["active", "frozen"] as const) {
    mocks.requireReadableProject.mockResolvedValue({
      actor: { memberships: [{ projectId: "project_1", role: "admin" }] },
      project: { id: "project_1", publicId: "prj_abcdefghijklmnopqrstuvwx", writeMode },
    });
    mocks.getCompetitorSetSettings.mockResolvedValue({ competitors: [], markets: [] });
    render(await CompetitorsSettingsPage({ params: Promise.resolve({ project: "prj_admin" }) }));
    expect(mocks.CompetitorSetTable).toHaveBeenLastCalledWith(
      expect.objectContaining({
        canDelete: writeMode === "active",
        canEdit: writeMode === "active",
        removeCompetitor: expect.any(Function),
        updateCompetitor: expect.any(Function),
      }),
      undefined,
    );
  }
});
