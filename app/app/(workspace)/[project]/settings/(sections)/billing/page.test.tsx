import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canProjectAction: vi.fn(),
  deploymentMode: vi.fn(),
  getPricingFeedbackRow: vi.fn(),
  getProjectRole: vi.fn(),
  requireReadableProject: vi.fn(),
  requireSession: vi.fn(),
  planContent: vi.fn(),
}));

vi.mock("@/app/app/(workspace)/[project]/settings/(sections)/usage/actions", () => ({
  submitHostedPricingFeedback: vi.fn(),
}));
vi.mock("@/components/settings/shell/SettingsShell", () => ({
  SettingsShell: ({ children, projectRef }: { children: React.ReactNode; projectRef: string }) => (
    <main data-project-ref={projectRef}>{children}</main>
  ),
}));
vi.mock("@/components/settings/usage/PlanCard", () => ({
  PlanCard: (props: Record<string, unknown>) => {
    mocks.planContent(props);
    return <section aria-label="Billing content" />;
  },
}));
vi.mock("@/lib/auth/authorize", () => ({ getProjectRole: mocks.getProjectRole }));
vi.mock("@/lib/auth/capabilities", () => ({ canProjectAction: mocks.canProjectAction }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/deployment/deployment", () => ({ deploymentMode: mocks.deploymentMode }));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("@/lib/queries/waitlist", () => ({
  getPricingFeedbackRow: mocks.getPricingFeedbackRow,
}));
vi.mock("@/lib/routing/app-path", () => ({ asProjectRef: (value: string) => value }));

import BillingSettingsPage from "@/app/app/(workspace)/[project]/settings/(sections)/billing/page";

const session = { user: { email: "owner@example.com", id: "user_1" } };

describe("BillingSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deploymentMode.mockReturnValue("cloud");
    mocks.getProjectRole.mockReturnValue("owner");
    mocks.canProjectAction.mockImplementation(
      (role: string | null, _action: string, resource: string) =>
        role === "owner" && ["billing", "project"].includes(resource),
    );
    mocks.requireReadableProject.mockResolvedValue({
      actor: { id: "user_1" },
      project: { id: "project_1", publicId: "prj_story", writeMode: "active" },
    });
    mocks.requireSession.mockResolvedValue(session);
    mocks.getPricingFeedbackRow.mockResolvedValue(null);
  });

  it("derives hosted billing capabilities on the server", async () => {
    render(await BillingSettingsPage({ params: Promise.resolve({ project: "prj_story" }) }));

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_story");
    expect(screen.getByRole("main")).toHaveAttribute("data-project-ref", "prj_story");
    expect(mocks.planContent).toHaveBeenCalledWith(
      expect.objectContaining({
        canSubmitPricingFeedback: true,
        deployment: "cloud",
        projectId: "prj_story",
      }),
    );
  });

  it("queries the waitlist row with the authenticated session email", async () => {
    render(await BillingSettingsPage({ params: Promise.resolve({ project: "prj_story" }) }));

    expect(mocks.getPricingFeedbackRow).toHaveBeenCalledWith("owner@example.com");
  });

  it("marks feedback answered when the row source is settings_feedback", async () => {
    mocks.getPricingFeedbackRow.mockResolvedValue({
      hostedPriceAnsweredAt: null,
      source: "settings_feedback",
    });

    render(await BillingSettingsPage({ params: Promise.resolve({ project: "prj_story" }) }));

    expect(mocks.planContent).toHaveBeenCalledWith(
      expect.objectContaining({ initialAnswered: true }),
    );
  });

  it("marks feedback answered when hostedPriceAnsweredAt is set", async () => {
    mocks.getPricingFeedbackRow.mockResolvedValue({
      hostedPriceAnsweredAt: new Date("2026-08-15T21:00:00.000Z"),
      source: "cloud_pricing",
    });

    render(await BillingSettingsPage({ params: Promise.resolve({ project: "prj_story" }) }));

    expect(mocks.planContent).toHaveBeenCalledWith(
      expect.objectContaining({ initialAnswered: true }),
    );
  });

  it("passes false when no prior feedback exists", async () => {
    mocks.getPricingFeedbackRow.mockResolvedValue(null);

    render(await BillingSettingsPage({ params: Promise.resolve({ project: "prj_story" }) }));

    expect(mocks.planContent).toHaveBeenCalledWith(
      expect.objectContaining({
        initialAnswered: false,
      }),
    );
  });

  it("passes self-host mode and read-only capabilities without client inference", async () => {
    mocks.deploymentMode.mockReturnValue("self-host");
    mocks.getProjectRole.mockReturnValue("viewer");

    render(await BillingSettingsPage({ params: Promise.resolve({ project: "prj_story" }) }));

    expect(mocks.planContent).toHaveBeenCalledWith(
      expect.objectContaining({
        canSubmitPricingFeedback: false,
        deployment: "self-host",
      }),
    );
  });

  it.each(["migration_hold", "migrated"])(
    "hides billing mutations while the project is %s",
    async (writeMode) => {
      mocks.requireReadableProject.mockResolvedValue({
        actor: { id: "user_1" },
        project: { id: "project_1", publicId: "prj_story", writeMode },
      });

      render(await BillingSettingsPage({ params: Promise.resolve({ project: "prj_story" }) }));

      expect(mocks.planContent).toHaveBeenCalledWith(
        expect.objectContaining({
          canSubmitPricingFeedback: false,
        }),
      );
    },
  );
});
