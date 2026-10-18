import messages from "@/messages/core/en/project-runs-schedules.json";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { nextRunLabel } from "./schedule-next-run";

describe("schedule next run", () => {
  it("leaves a corrupt stored zone unresolved without breaking the shared list", () => {
    const t = createTranslator({ locale: "en", messages, namespace: "projectRuns.schedules" });
    expect(nextRunLabel("2026-10-22T09:00:00Z", "Invalid/Zone", "en", t)).toBeNull();
  });
});
