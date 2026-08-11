import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIngestHooks: vi.fn(),
  getPreferences: vi.fn(),
  getSettings: vi.fn(),
  headers: vi.fn(),
  requireReadableProject: vi.fn(),
}));

vi.mock("@/components/settings/developers/DevelopersSettingsContent", () => ({
  DevelopersSettingsContent: ({
    canManage,
    endpointUrl,
    projectId,
  }: {
    canManage: boolean;
    endpointUrl: string;
    projectId: string;
  }) => (
    <div
      data-can-manage={String(canManage)}
      data-endpoint-url={endpointUrl}
      data-project-id={projectId}
      data-testid="developers-content"
    />
  ),
}));
vi.mock("@/components/settings/shell/SettingsShell", () => ({
  SettingsShell: ({ children, projectRef }: { children: ReactNode; projectRef: string }) => (
    <main data-project-ref={projectRef}>{children}</main>
  ),
}));
vi.mock("@/lib/actions/apiKey", () => ({
  issueApiKey: vi.fn(),
  regenerateApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}));
vi.mock("@/lib/actions/ingest-hooks", () => ({
  createIngestHook: vi.fn(),
  deleteIngestHook: vi.fn(),
  disableIngestHook: vi.fn(),
  rotateIngestHook: vi.fn(),
  sendIngestHookTest: vi.fn(),
}));
vi.mock("@/lib/agent-ready/origin", () => ({
  absoluteUrl: () => "https://example.com/api/ingest/deploy",
  getOriginFromHeaders: () => "https://example.com",
}));
vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: mocks.requireReadableProject,
}));
vi.mock("@/lib/queries/account", () => ({ getPreferences: mocks.getPreferences }));
vi.mock("@/lib/queries/ingest-hooks", () => ({ getIngestHooks: mocks.getIngestHooks }));
vi.mock("@/lib/queries/settings", () => ({ getSettings: mocks.getSettings }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));

import DevelopersSettingsPage from "@/app/app/(workspace)/[project]/settings/(sections)/developers/page";

describe("DevelopersSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPreferences.mockResolvedValue({ dateFormat: "auto" });
    mocks.getSettings.mockResolvedValue({
      apiKeys: [],
      project: { projectId: "prj_resolved" },
    });
    mocks.getIngestHooks.mockResolvedValue([]);
    mocks.headers.mockResolvedValue(new Headers());
    mocks.requireReadableProject.mockResolvedValue({
      actor: { id: "usr_example", memberships: [{ projectId: "project_1", role: "admin" }] },
      project: { id: "project_1", publicId: "prj_resolved", writeMode: "active" },
    });
  });

  it("loads project data through authorized server queries and exposes admin actions", async () => {
    render(await DevelopersSettingsPage({ params: Promise.resolve({ project: "prj_untrusted" }) }));

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_untrusted");
    expect(mocks.getSettings).toHaveBeenCalledWith("prj_untrusted", {
      preferences: { dateFormat: "auto" },
    });
    expect(mocks.getIngestHooks).toHaveBeenCalledWith("prj_untrusted", {
      preferences: { dateFormat: "auto" },
    });
    expect(screen.getByRole("main")).toHaveAttribute("data-project-ref", "prj_resolved");
    expect(screen.getByTestId("developers-content")).toHaveAttribute("data-can-manage", "true");
    expect(screen.getByTestId("developers-content")).toHaveAttribute(
      "data-endpoint-url",
      "https://example.com/api/ingest/deploy",
    );
  });

  it("does not expose mutation controls to a viewer", async () => {
    mocks.requireReadableProject.mockResolvedValue({
      actor: { id: "usr_example", memberships: [{ projectId: "project_1", role: "viewer" }] },
      project: { id: "project_1", publicId: "prj_resolved", writeMode: "active" },
    });

    render(await DevelopersSettingsPage({ params: Promise.resolve({ project: "prj_untrusted" }) }));

    expect(screen.getByTestId("developers-content")).toHaveAttribute("data-can-manage", "false");
  });

  it.each(["migration_hold", "migrated"])(
    "does not expose developer mutations while the project is %s",
    async (writeMode) => {
      mocks.requireReadableProject.mockResolvedValue({
        actor: { id: "usr_example", memberships: [{ projectId: "project_1", role: "admin" }] },
        project: { id: "project_1", publicId: "prj_resolved", writeMode },
      });

      render(
        await DevelopersSettingsPage({ params: Promise.resolve({ project: "prj_untrusted" }) }),
      );

      expect(screen.getByTestId("developers-content")).toHaveAttribute("data-can-manage", "false");
    },
  );

  it("does not render when server-side project access is denied", async () => {
    mocks.requireReadableProject.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(
      DevelopersSettingsPage({ params: Promise.resolve({ project: "prj_unavailable" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
