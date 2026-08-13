import {
  getSettingsActionMocks,
  resetSettingsActionMocks,
} from "@/lib/actions/settings-test-harness";
import { appPath } from "@/lib/routing/app-path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const settingsActionMocks = getSettingsActionMocks();
let actions: typeof import("@/lib/actions/settings");

beforeAll(async () => {
  actions = await import("@/lib/actions/settings");
});

describe("manual project checks from settings", () => {
  beforeEach(resetSettingsActionMocks);

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("runs manual project checks with bounded concurrency and returns honest start totals", async () => {
    settingsActionMocks.prisma.keyword.findMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) => ({ publicId: `kw_${index + 1}` })),
    );
    let active = 0;
    let maxActive = 0;
    settingsActionMocks.runCheckNow.mockImplementation(
      async ({ keywordId }: { keywordId: string }) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
        if (keywordId === "kw_3") {
          throw new Error("check failed");
        }
        return { status: "running" };
      },
    );

    const result = await actions.runManualProjectCheck({
      projectId: "prj_abcdefghijklmnopqrstuvwx",
    });

    expect(result).toEqual({ failed: 1, queued: 5, total: 6 });
    expect(settingsActionMocks.runCheckNow).toHaveBeenCalledTimes(6);
    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(settingsActionMocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "settings.run_check_now",
        after: { failed: 1, queued: 5, total: 6 },
      }),
    );
    expect(settingsActionMocks.revalidatePath).toHaveBeenCalledWith(
      appPath("[project]", "rank-tracker"),
      "page",
    );
    expect(settingsActionMocks.revalidatePath).toHaveBeenCalledWith(
      appPath("[project]", "alerts"),
      "page",
    );
    expect(settingsActionMocks.revalidatePath).toHaveBeenCalledWith(
      appPath("[project]", "competitors"),
      "page",
    );
    expect(settingsActionMocks.revalidatePath).toHaveBeenCalledWith(
      appPath("[project]", "settings"),
      "page",
    );
    expect(settingsActionMocks.revalidatePath).toHaveBeenCalledWith(
      appPath("[project]", "settings", "audit"),
      "page",
    );
  });

  it("does not count an already in-flight check as newly started", async () => {
    settingsActionMocks.prisma.keyword.findMany.mockResolvedValue([
      { publicId: "kw_1" },
      { publicId: "kw_2" },
    ]);
    settingsActionMocks.runCheckNow.mockImplementation(
      async ({ keywordId }: { keywordId: string }) =>
        keywordId === "kw_1"
          ? {
              code: "check_in_progress",
              message: "A rank check is already queued or running.",
              status: "not_started",
            }
          : { status: "running" },
    );

    const result = await actions.runManualProjectCheck({
      projectId: "prj_abcdefghijklmnopqrstuvwx",
    });

    expect(result).toEqual({ failed: 1, queued: 1, total: 2 });
  });

  it("stops scheduling project checks after the budget is exhausted", async () => {
    settingsActionMocks.prisma.keyword.findMany.mockResolvedValue(
      Array.from({ length: 8 }, (_, index) => ({ publicId: `kw_${index + 1}` })),
    );
    settingsActionMocks.runCheckNow.mockImplementation(
      async ({ keywordId }: { keywordId: string }) => {
        if (keywordId === "kw_1") {
          return {
            code: "budget_exhausted",
            message: "Rank check monthly budget reached.",
            status: "not_started",
          };
        }
        await Promise.resolve();
        return { status: "running" };
      },
    );

    const result = await actions.runManualProjectCheck({
      projectId: "prj_abcdefghijklmnopqrstuvwx",
    });

    expect(result).toEqual({
      failed: 5,
      queued: 3,
      reason: "budget_exhausted",
      total: 8,
    });
    expect(settingsActionMocks.runCheckNow).toHaveBeenCalledTimes(4);
    expect(settingsActionMocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "settings.run_check_now",
        after: result,
      }),
    );
  });
});
