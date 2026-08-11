import { previewProjectCronRuns } from "@/lib/actions/settings-cron-preview";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireReadableProject: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));

describe("previewProjectCronRuns", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T04:00:00.000Z"));
    mocks.requireReadableProject.mockResolvedValue({});
  });

  it("authorizes the project read and identifies raw cron anchors before dispatcher jitter", async () => {
    const result = await previewProjectCronRuns({
      cronExpression: "0 6 * * *",
      projectId: "prj_1",
      timezone: "Europe/Warsaw",
    });

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
    expect(result).toEqual({
      message: "Each keyword is scheduled at or after an anchor using deterministic jitter.",
      runs: ["Aug 10, 06:00", "Aug 11, 06:00", "Aug 12, 06:00"],
      status: "ready",
    });
  });

  it("returns the B1 hourly-floor error without exposing a parser exception", async () => {
    await expect(
      previewProjectCronRuns({
        cronExpression: "*/30 * * * *",
        projectId: "prj_1",
        timezone: "UTC",
      }),
    ).resolves.toEqual({
      message: "Custom cron schedules must run at least one hour apart.",
      runs: [],
      status: "invalid",
    });
  });
});
