import { sessionSavedViewContext } from "@/lib/saved-views/context";
import { viewProjectId } from "@/lib/saved-views/view-test-fixture";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { setPersonalDefaultSchema } from "./model";
import { setPersonalDefaultFor } from "./service";
import { readPersonalSurfacePreferenceFor } from "./store";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

const context = sessionSavedViewContext({ id: "trusted-session-viewer", memberships: [] });
const input = {
  expectedRevision: 2,
  projectId: viewProjectId,
  surface: "dashboard",
  target: { kind: "preset", presetId: "general" },
};

describe("table personal preference boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a dashboard preset before the generic default setter opens a transaction", async () => {
    await expect(setPersonalDefaultFor(input, context)).rejects.toThrow(ZodError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects the generic dashboard reader instead of projecting Local as unavailable General", async () => {
    await expect(
      readPersonalSurfacePreferenceFor(context, viewProjectId, "dashboard"),
    ).rejects.toThrow(ZodError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(["keywords", "competitors"])("retains the %s General table command", (surface) => {
    expect(setPersonalDefaultSchema.parse({ ...input, surface })).toEqual({ ...input, surface });
  });
});
