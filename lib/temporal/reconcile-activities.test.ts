import { expect, it } from "vitest";
import { reconcileAllSchedulesActivity } from "./reconcile-activities";

it("completes a historical reconciler activity without importing the database or scheduler", async () => {
  await expect(reconcileAllSchedulesActivity()).resolves.toEqual({
    scanned: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    failed: 0,
    listed: 0,
  });
});
