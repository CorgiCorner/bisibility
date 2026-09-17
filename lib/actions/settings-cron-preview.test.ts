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

  it("authorizes the project read and returns stable preview data for localized presentation", async () => {
    const result = await previewProjectCronRuns({
      cronExpression: "0 6 * * *",
      projectId: "prj_1",
      timezone: "Europe/Warsaw",
    });

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
    expect(result).toEqual({
      message: "ready",
      runs: ["2026-08-10T04:00:00.000Z", "2026-08-11T04:00:00.000Z", "2026-08-12T04:00:00.000Z"],
      status: "ready",
      timezone: "Europe/Warsaw",
    });
  });

  it("returns the stable hourly-floor code without exposing a parser exception", async () => {
    await expect(
      previewProjectCronRuns({
        cronExpression: "*/30 * * * *",
        projectId: "prj_1",
        timezone: "UTC",
      }),
    ).resolves.toEqual({
      message: "anchors_too_close",
      runs: [],
      status: "invalid",
      timezone: null,
    });
  });
});
