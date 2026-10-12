import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { BudgetExhaustedError } from "@/lib/rank-check/budget";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  launch: vi.fn(),
  inline: vi.fn(),
  inlineEnabled: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("./_shared", () => ({
  getActionActor: async () => ({ id: "actor" }),
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireKeywordScope: async () => ({
    id: "keyword",
    publicId: "kw_abcdefghijklmnopqrstuvwx",
    projectId: "project",
    projectIsSample: false,
  }),
  revalidateRankCheckViews: mocks.revalidate,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    project: {
      findUniqueOrThrow: async () => ({ id: "project", domain: "example.com", isSample: false }),
    },
  },
}));
vi.mock("@/lib/rank-check/runs/launch-single", () => ({ launchSingleRankCheckRun: mocks.launch }));

import { runCheckNow } from "./rankCheck";

vi.mock("@/lib/rank-check/inline-execution", () => ({
  inlineRankCheckExecutionEnabled: mocks.inlineEnabled,
}));
vi.mock("@/lib/rank-check/runs/inline", () => ({ runInlineRankCheck: mocks.inline }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.inlineEnabled.mockReturnValue(false);
});
it.each([
  new BudgetExhaustedError({
    projectId: "project",
    capCents: 0,
    spentCents: 0,
    reason: "budget_missing",
  }),
  new DeploymentAdmissionExhaustedError("budget", { budgetReason: "budget_missing" }),
])("returns a serializable missing-budget failure for manual and bulk callers", async (error) => {
  mocks.launch.mockRejectedValueOnce(error);
  const result = await runCheckNow({ keywordId: "kw_abcdefghijklmnopqrstuvwx" });
  expect(JSON.parse(JSON.stringify(result))).toMatchObject({
    code: "budget_missing",
    status: "not_started",
    message: expect.stringContaining("configure a monthly budget"),
  });
});

it("budget regression: revalidates views after an inline missing-budget refusal", async () => {
  mocks.inlineEnabled.mockReturnValue(true);
  mocks.launch.mockResolvedValue({ publicId: "rcr_launched" });
  mocks.inline.mockRejectedValue(
    new DeploymentAdmissionExhaustedError("budget", { budgetReason: "budget_missing" }),
  );
  const result = await runCheckNow({ keywordId: "kw_abcdefghijklmnopqrstuvwx" });
  expect(result).toMatchObject({
    code: "budget_missing",
    status: "not_started",
    message: expect.stringContaining("configure a monthly budget"),
  });
  expect(mocks.inline).toHaveBeenCalledWith(
    expect.objectContaining({ runPublicId: "rcr_launched", keywordId: "keyword" }),
  );
  expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith("kw_abcdefghijklmnopqrstuvwx");
});
