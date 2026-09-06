import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderPhaseRecorder } from "./render-phases";

describe("render phase recorder", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.SEARCH_INSIGHTS_TIMING_RECORD_RATE;
  });

  function recorder(overrides: Partial<Parameters<typeof createRenderPhaseRecorder>[0]> = {}) {
    return createRenderPhaseRecorder({
      period: "90",
      projectId: "prj_1",
      record: true,
      ...overrides,
    });
  }

  it("reports one line carrying every phase and their total", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const r = recorder();
    await r.measure("scope", async () => "scope");
    await r.measure("context", async () => "context");
    r.report();

    expect(info).toHaveBeenCalledTimes(1);
    const [message, payload] = info.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toBe("[search-insights] render_phases");
    expect(Object.keys(payload.phases as object)).toEqual(["scope", "context"]);
    expect(payload).toMatchObject({ period: "90", projectId: "prj_1" });
  });

  it("returns what the phase returned and still records a phase that threw", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const r = recorder();
    await expect(r.measure("scope", async () => 41 + 1)).resolves.toBe(42);
    await expect(
      r.measure("context", async () => {
        throw new Error("context failed");
      }),
    ).rejects.toThrow("context failed");
    r.report();

    // A render that threw halfway is exactly the case worth seeing, so the finished phases report.
    const [, payload] = info.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(payload.phases as object)).toEqual(["scope", "context"]);
  });

  it("emits nothing at all when the render was not recorded", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const r = recorder({ record: false });
    await expect(r.measure("scope", async () => "value")).resolves.toBe("value");
    r.report();
    expect(info).not.toHaveBeenCalled();
  });

  it("decides once, so a line can never hold a partial set of phases", async () => {
    const random = vi.fn().mockReturnValueOnce(0.99).mockReturnValue(0);
    const r = createRenderPhaseRecorder({ period: "7", projectId: "prj_1", random });
    expect(r.record).toBe(false);
    expect(random).toHaveBeenCalledTimes(1);
  });

  it("honours the configured rate and rejects a malformed one", () => {
    process.env.SEARCH_INSIGHTS_TIMING_RECORD_RATE = "1";
    expect(
      createRenderPhaseRecorder({ period: "7", projectId: "prj_1", random: () => 0.9 }).record,
    ).toBe(true);

    process.env.SEARCH_INSIGHTS_TIMING_RECORD_RATE = "not-a-number";
    expect(() =>
      createRenderPhaseRecorder({ period: "7", projectId: "prj_1", random: () => 0 }),
    ).toThrow("SEARCH_INSIGHTS_TIMING_RECORD_RATE");
  });

  it("does not report twice for one render", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const r = recorder();
    await r.measure("scope", async () => "scope");
    r.report();
    r.report();
    expect(info).toHaveBeenCalledTimes(1);
  });
});
