import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deploymentMode: vi.fn(),
  getActionActor: vi.fn(),
  getPricingFeedbackRow: vi.fn(),
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
vi.mock("@/lib/actions/waitlist", () => ({
  joinWaitlist: mocks.joinWaitlist,
}));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/deployment/deployment", () => ({ deploymentMode: mocks.deploymentMode }));
vi.mock("@/lib/queries/waitlist", () => ({
  getPricingFeedbackRow: mocks.getPricingFeedbackRow,
}));

import {
  submitHostedPricingFeedback,
  updateUsageBudget,
} from "@/app/app/(workspace)/[project]/settings/(sections)/usage/actions";

const project = {
  id: "project_internal_1",
  publicId: "prj_a00000000000000000000000",
};

const session = { user: { email: "owner@example.com", id: "user_1" } };

describe("usage settings actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deploymentMode.mockReturnValue("cloud");
    mocks.getActionActor.mockResolvedValue({ id: "user_1" });
    mocks.getPricingFeedbackRow.mockResolvedValue(null);
    mocks.requireProjectScope.mockResolvedValue(project);
    mocks.requireSession.mockResolvedValue(session);
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

  it("returns a friendly no-op on repeat feedback without persistence or audit", async () => {
    mocks.getPricingFeedbackRow.mockResolvedValue({
      hostedPriceAnsweredAt: null,
      source: "settings_feedback",
    });

    await expect(
      submitHostedPricingFeedback({ monthlyPrice: "30", projectId: project.publicId }),
    ).resolves.toEqual({ answered: true });

    expect(mocks.getPricingFeedbackRow).toHaveBeenCalledWith("owner@example.com");
    expect(mocks.joinWaitlist).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("returns a friendly no-op when only hostedPriceAnsweredAt is set", async () => {
    mocks.getPricingFeedbackRow.mockResolvedValue({
      hostedPriceAnsweredAt: new Date("2026-08-15T21:00:00.000Z"),
      source: "cloud_pricing",
    });

    await expect(
      submitHostedPricingFeedback({ monthlyPrice: "30", projectId: project.publicId }),
    ).resolves.toEqual({ answered: true });

    expect(mocks.joinWaitlist).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("audits only the first accepted feedback", async () => {
    mocks.getPricingFeedbackRow.mockResolvedValue(null);

    await submitHostedPricingFeedback({ monthlyPrice: "25", projectId: project.publicId });
    expect(mocks.writeAudit).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    mocks.getPricingFeedbackRow.mockResolvedValue({
      hostedPriceAnsweredAt: new Date("2026-08-15T21:00:00.000Z"),
      source: "settings_feedback",
    });

    await submitHostedPricingFeedback({ monthlyPrice: "30", projectId: project.publicId });
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("rechecks server-side before persistence", async () => {
    mocks.getPricingFeedbackRow.mockResolvedValue({
      hostedPriceAnsweredAt: new Date("2026-08-15T21:00:00.000Z"),
      source: "settings_feedback",
    });

    await submitHostedPricingFeedback({ monthlyPrice: "25", projectId: project.publicId });

    expect(mocks.getPricingFeedbackRow).toHaveBeenCalledWith("owner@example.com");
    expect(mocks.joinWaitlist).not.toHaveBeenCalled();
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
