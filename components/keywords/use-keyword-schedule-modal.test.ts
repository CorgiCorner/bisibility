import { describe, expect, it, vi } from "vitest";
import { loadSchedules } from "./use-keyword-schedule-modal";

describe("loadSchedules", () => {
  it("keeps the project identifier in the request and reduces an app-route detail to a typed remedy code", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: "Raw server detail must not reach the interface.",
          type: "https://example.com/problems/forbidden",
        }),
        { status: 403 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadSchedules("prj_schedule_modal")).rejects.toMatchObject({
      message: "forbidden",
      problem: "forbidden",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/check-schedules?project=prj_schedule_modal",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
    vi.unstubAllGlobals();
  });
});
