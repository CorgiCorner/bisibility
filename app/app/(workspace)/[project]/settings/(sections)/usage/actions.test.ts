import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deploymentMode: vi.fn(),
  getActionActor: vi.fn(),
  joinWaitlist: vi.fn(),
  requireProjectScope: vi.fn(),
  requireSession: vi.fn(),
  updateProjectBudgetAction: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.getActionActor,
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.requireProjectScope,
}));
vi.mock("@/lib/actions/budget", () => ({
  updateProjectBudgetAction: mocks.updateProjectBudgetAction,
}));
vi.mock("@/lib/actions/waitlist", () => ({ joinWaitlist: mocks.joinWaitlist }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/deployment/deployment", () => ({ deploymentMode: mocks.deploymentMode }));

import {
  submitHostedPricingFeedback,
  updateUsageBudget,
} from "@/app/app/(workspace)/[project]/settings/(sections)/usage/actions";

const project = {
  id: "project_internal_1",
  publicId: "prj_a00000000000000000000000",
};

describe("usage settings actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deploymentMode.mockReturnValue("cloud");
    mocks.getActionActor.mockResolvedValue({ id: "user_1" });
    mocks.requireProjectScope.mockResolvedValue(project);
    mocks.requireSession.mockResolvedValue({ user: { email: "owner@example.com", id: "user_1" } });
    mocks.joinWaitlist.mockResolvedValue({ email: "owner@example.com", ok: true });
    mocks.updateProjectBudgetAction.mockResolvedValue({ capCents: 7_500 });
  });

  it("binds hosted pricing feedback to the authenticated session email", async () => {
    await expect(
      submitHostedPricingFeedback({
        email: "attacker@example.org",
        monthlyPrice: "25",
        projectId: project.publicId,
      }),
    ).resolves.toEqual({ answered: true });

    expect(mocks.joinWaitlist).toHaveBeenCalledWith({
      cloudPrice: "custom",
      cloudPriceCustom: "25",
      email: "owner@example.com",
      source: "settings_feedback",
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith({
      action: "settings.hosted_pricing_feedback.submit",
      actorId: "user_1",
      after: { answered: true, category: "custom" },
      projectId: project.id,
      targetId: project.publicId,
      targetType: "project",
    });
  });

  it("rejects the WTP action on self-host without persistence or audit", async () => {
    mocks.deploymentMode.mockReturnValue("self-host");

    await expect(
      submitHostedPricingFeedback({ monthlyPrice: "25", projectId: project.publicId }),
    ).rejects.toThrow("Hosted pricing feedback is unavailable on self-hosted installs.");

    expect(mocks.joinWaitlist).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("rejects a non-owner before persistence or audit", async () => {
    mocks.requireProjectScope.mockRejectedValue(new Error("Forbidden"));

    await expect(
      submitHostedPricingFeedback({ monthlyPrice: "25", projectId: project.publicId }),
    ).rejects.toThrow("Forbidden");

    expect(mocks.joinWaitlist).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("validates and converts the shared budget form before the audited budget action", async () => {
    await expect(
      updateUsageBudget({ budgetDollars: "75.00", projectId: project.publicId }),
    ).resolves.toEqual({ capCents: 7_500 });

    expect(mocks.updateProjectBudgetAction).toHaveBeenCalledWith({
      capCents: 7_500,
      projectId: project.publicId,
    });
  });
});
