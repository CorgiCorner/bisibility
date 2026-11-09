import { WeeklyRequestCapError } from "@/lib/operations/weekly-request-error";
import { readObservedResponse } from "@/lib/providers/usage";
import { expect, it, vi } from "vitest";
import { errorFromUnknown } from "./error-mapper";

it("returns 429 and seconds until the weekly reset", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-11T23:59:00Z"));
  try {
    const denial = await readObservedResponse({
      observer: {
        begin: async () => "attempt",
        beforeDispatch: async () => {
          throw new WeeklyRequestCapError("2026-11-12T00:00:00Z");
        },
        cancel: async () => {},
        settle: vi.fn(),
      },
      request: vi.fn(),
      measure: vi.fn(),
    }).catch((error: unknown) => error);
    const response = errorFromUnknown(
      denial,
      new Headers(),
      new URL("https://example.com/api/v1/checks"),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).toMatchObject({
      type: expect.stringContaining("weekly_request_cap_reached"),
      details: { code: "weekly_request_cap_reached", resetsAt: "2026-11-12T00:00:00Z" },
    });
  } finally {
    vi.useRealTimers();
  }
});
