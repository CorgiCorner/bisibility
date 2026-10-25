import { makePublicId } from "@/lib/db/public-id";
import { expect, it } from "vitest";
import { checkNotificationSummariesEnabled } from "./switch";

it("is active without configuration and keeps both demo notification fences", () => {
  expect(checkNotificationSummariesEnabled({})).toBe(true);
  const ids = {
    DEMO_USER_ID: makePublicId("usr"),
    DEMO_PROJECT_ID: makePublicId("prj"),
    DEMO_OWNER_ID: makePublicId("usr"),
  };
  expect(checkNotificationSummariesEnabled({ ...ids, READ_ONLY_DEMO: "1" })).toBe(false);
  expect(checkNotificationSummariesEnabled({ ...ids, DEMO_MODE: "editable" })).toBe(false);
});
