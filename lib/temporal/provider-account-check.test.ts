import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sweep: vi.fn(),
  check: vi.fn(),
  ensure: vi.fn(),
  pause: vi.fn(),
}));
vi.mock("../integrations/provider-recovery/auto-checks", () => ({
  checkDueProviderAccounts: mocks.sweep,
}));
vi.mock("./bootstrap", () => ({ ensureSingletonSchedule: mocks.ensure }));
vi.mock("./schedule-pause", () => ({ pauseSingletonSchedule: mocks.pause }));
vi.mock("@temporalio/workflow", () => ({
  proxyActivities: () => ({ checkProviderAccountsActivity: mocks.check }),
}));

import { checkProviderAccountsActivity } from "./provider-account-check-activity";
import {
  ensureProviderAccountCheckSchedule,
  PROVIDER_ACCOUNT_CHECK_SCHEDULE_ID,
} from "./provider-account-check-bootstrap";
import { checkProviderAccountsWorkflow } from "./provider-account-check-workflow";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "1");
});
afterEach(() => vi.unstubAllEnvs());
it("pauses the schedule when scheduled maintenance is off", async () => {
  vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "0");
  await ensureProviderAccountCheckSchedule();
  expect(mocks.pause).toHaveBeenCalledOnce();
  expect(mocks.ensure).not.toHaveBeenCalled();
  expect(await checkProviderAccountsActivity()).toEqual({ status: "skipped" });
  expect(mocks.sweep).not.toHaveBeenCalled();
});
it("registers a bounded maintenance activity and workflow", async () => {
  await ensureProviderAccountCheckSchedule();
  expect(mocks.ensure).toHaveBeenCalledWith(
    expect.objectContaining({
      scheduleId: PROVIDER_ACCOUNT_CHECK_SCHEDULE_ID,
      workflowType: "checkProviderAccountsWorkflow",
    }),
    undefined,
  );
  mocks.sweep.mockResolvedValue({
    status: "completed",
    scanned: 1,
    checked: 1,
    skipped: 0,
    failed: 0,
  });
  expect(await checkProviderAccountsActivity()).toMatchObject({ checked: 1 });
  mocks.check.mockResolvedValue({ status: "skipped" });
  expect(await checkProviderAccountsWorkflow()).toEqual({ status: "skipped" });
  const root = process.cwd();
  expect(readFileSync(resolve(root, "lib/temporal/worker.ts"), "utf8")).toContain(
    "ensureProviderAccountCheckSchedule(),",
  );
  expect(readFileSync(resolve(root, "lib/temporal/workflows.ts"), "utf8")).toContain(
    "checkProviderAccountsWorkflow",
  );
  expect(readFileSync(resolve(root, "lib/temporal/activities.ts"), "utf8")).toContain(
    "checkProviderAccountsActivity",
  );
});
