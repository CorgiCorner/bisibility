import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canProjectAction: vi.fn(),
  deploymentMode: vi.fn(),
  getProjectRole: vi.fn(),
  getSettings: vi.fn(),
  requireReadableProject: vi.fn(),
  usageContent: vi.fn(),
}));

vi.mock("@/app/app/(workspace)/[project]/settings/(sections)/usage/actions", () => ({
  submitHostedPricingFeedback: vi.fn(),
  updateUsageBudget: vi.fn(),
}));
vi.mock("@/components/settings/shell/SettingsShell", () => ({
  SettingsShell: ({ children, projectRef }: { children: React.ReactNode; projectRef: string }) => (
    <main data-project-ref={projectRef}>{children}</main>
  ),
}));
vi.mock("@/components/settings/usage/UsageSettingsContent", () => ({
  UsageSettingsContent: (props: Record<string, unknown>) => {
    mocks.usageContent(props);
    return <section aria-label="Usage content" />;
  },
}));
vi.mock("@/lib/auth/authorize", () => ({ getProjectRole: mocks.getProjectRole }));
vi.mock("@/lib/auth/capabilities", () => ({ canProjectAction: mocks.canProjectAction }));
vi.mock("@/lib/deployment/deployment", () => ({ deploymentMode: mocks.deploymentMode }));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("@/lib/queries/settings", () => ({ getSettings: mocks.getSettings }));
vi.mock("@/lib/routing/app-path", () => ({ asProjectRef: (value: string) => value }));

import UsageSettingsPage from "@/app/app/(workspace)/[project]/settings/(sections)/usage/page";

const usage = {
  budget: { capCents: 5_000, spentCents: 0 },
  connections: [],
  hasProvider: false,
  onPaceCents: null,
  primaryProvider: "-",
  serpChecksMonth: "0",
};

describe("UsageSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deploymentMode.mockReturnValue("cloud");
    mocks.getProjectRole.mockReturnValue("owner");
    mocks.canProjectAction.mockImplementation(
      (role: string | null, _action: string, resource: string) =>
        role === "owner" && ["billing", "project"].includes(resource),
    );
    mocks.getSettings.mockResolvedValue({
      project: { projectId: "prj_story" },
      usage,
    });
    mocks.requireReadableProject.mockResolvedValue({
      actor: { id: "user_1" },
      project: { id: "project_1", publicId: "prj_story", writeMode: "active" },
    });
  });

  it("loads real settings data and derives hosted owner capabilities on the server", async () => {
    render(await UsageSettingsPage({ params: Promise.resolve({ project: "prj_story" }) }));

    expect(mocks.getSettings).toHaveBeenCalledWith("prj_story");
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_story");
    expect(screen.getByRole("main")).toHaveAttribute("data-project-ref", "prj_story");
    expect(mocks.usageContent).toHaveBeenCalledWith(
      expect.objectContaining({
        canEditBudget: true,
        canSubmitPricingFeedback: true,
        deployment: "cloud",
        projectId: "prj_story",
        usage,
      }),
    );
  });

  it("passes self-host mode and read-only capabilities without client inference", async () => {
    mocks.deploymentMode.mockReturnValue("self-host");
    mocks.getProjectRole.mockReturnValue("viewer");

    render(await UsageSettingsPage({ params: Promise.resolve({ project: "prj_story" }) }));

    expect(mocks.usageContent).toHaveBeenCalledWith(
      expect.objectContaining({
        canEditBudget: false,
        canSubmitPricingFeedback: false,
        deployment: "self-host",
      }),
    );
  });

  it.each(["migration_hold", "migrated"])(
    "hides usage mutations while the project is %s",
    async (writeMode) => {
      mocks.requireReadableProject.mockResolvedValue({
        actor: { id: "user_1" },
        project: { id: "project_1", publicId: "prj_story", writeMode },
      });

      render(await UsageSettingsPage({ params: Promise.resolve({ project: "prj_story" }) }));

      expect(mocks.usageContent).toHaveBeenCalledWith(
        expect.objectContaining({
          canEditBudget: false,
          canSubmitPricingFeedback: false,
        }),
      );
    },
  );
});
