import messages from "@/messages/core/en/project-runs-schedules.json";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { nextRunLabel } from "./schedule-next-run";

describe("schedule next run", () => {
  it("describes distributed windows without inventing a midnight start or fixed weekday", () => {
    const t = createTranslator({ locale: "en", messages, namespace: "projectRuns.schedules" });
    const start = "2026-10-26T00:00:00Z";
    expect(nextRunLabel(start, "UTC", "en", t, "day")).toBe("Mon, spread over the day (UTC)");
    expect(nextRunLabel(start, "UTC", "en", t, "interval")).toBe(
      "From Mon, spread across the interval (UTC)",
    );
    expect(nextRunLabel(start, "Invalid/Zone", "en", t, "day")).toBeNull();
    expect(nextRunLabel("not-a-date", "UTC", "en", t, "day")).toBeNull();
  });
  it("leaves a corrupt stored zone unresolved without breaking the shared list", () => {
    const t = createTranslator({ locale: "en", messages, namespace: "projectRuns.schedules" });
    expect(nextRunLabel("2026-10-22T09:00:00Z", "Invalid/Zone", "en", t)).toBeNull();
  });
});
