import { AuthorizationError } from "@/lib/auth/authorize";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { UsageDisplayConflictError } from "@/lib/project-usage-display/store";
import { beforeEach, expect, it, vi } from "vitest";
import { updateProjectUsageDisplay } from "./project-usage-display";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), save: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.actor,
  revalidateBudgetViews: mocks.revalidate,
}));
vi.mock("@/lib/project-usage-display/store", async (original) => {
  const source = await original<typeof import("@/lib/project-usage-display/store")>();
  return { ...source, saveProjectUsageDisplaySettings: mocks.save };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
const value = {
  projectId: `prj_${"a".repeat(24)}`,
  revision: 1,
  canEdit: true,
  options: { moneyDisplay: "currency" as const, moneyFractionDigits: 2, quantityFractionDigits: 2 },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ id: "session_user" });
});

it("derives the actor from the session and revalidates header plus project views after saving", async () => {
  mocks.save.mockResolvedValue(value);
  const input = { projectId: value.projectId, expectedRevision: 0, options: value.options };
  expect(await updateProjectUsageDisplay(input)).toEqual({ kind: "saved", value });
  expect(mocks.save).toHaveBeenCalledWith(input, { id: "session_user" });
  expect(mocks.revalidate).toHaveBeenCalledOnce();
});
it.each([new AuthorizationError("forbidden"), new ProjectReadOnlyError("project")])(
  "denies readonly or revoked writers without successful revalidation",
  async (error) => {
    mocks.save.mockRejectedValue(error);
    expect(await updateProjectUsageDisplay({})).toEqual({ kind: "forbidden" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  },
);
it("returns the server-authorized current value on a conflict", async () => {
  mocks.save.mockRejectedValue(new UsageDisplayConflictError(value));
  expect(await updateProjectUsageDisplay({})).toEqual({ kind: "conflict", value });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
