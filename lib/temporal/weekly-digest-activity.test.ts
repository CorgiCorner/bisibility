import { planRecoveryNotice } from "@/lib/provider-usage/recovery-notification-policy";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sendWeeklyReportDigestActivity } from "./weekly-digest-activity";

const mocks = vi.hoisted(() => ({ projects: vi.fn(), send: vi.fn(), switches: vi.fn() }));
vi.mock("@temporalio/activity", () => ({
  Context: {
    current: () => ({ info: { scheduledTimestampMs: Date.parse("2026-10-19T06:15:00Z") } }),
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { project: { findMany: mocks.projects } } }));
vi.mock("@/lib/reports/weekly-digest-send", () => ({ sendWeeklyDigestForProject: mocks.send }));
vi.mock("@/lib/provider-evidence/recovery/switches", () => ({ recoverySwitches: mocks.switches }));
vi.mock("@/lib/provider-usage/recovery-notification-policy", () => ({
  planRecoveryNotice: vi.fn(),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  mocks.projects.mockResolvedValue([{ id: "project" }]);
  mocks.switches.mockReturnValue({ incidentDigest: false });
  mocks.send.mockResolvedValue({ status: "sent", failed: 0, ambiguous: 1 });
});
it("WD-8 retries reuse workflow periodEnd despite a changed activity clock; optional input supports old histories", async () => {
  const periodEnd = "2026-10-19T06:15:00.000Z";
  vi.useFakeTimers();
  try {
    vi.setSystemTime("2026-10-19T06:16:00Z");
    await sendWeeklyReportDigestActivity({ periodEnd });
    vi.setSystemTime("2026-10-19T07:00:00Z");
    await sendWeeklyReportDigestActivity({ periodEnd });
    expect(mocks.send.mock.calls.map((call) => call[1].toISOString())).toEqual([
      periodEnd,
      periodEnd,
    ]);
    await sendWeeklyReportDigestActivity();
    expect(mocks.send.mock.calls[2][1].toISOString()).toBe(periodEnd);
    vi.setSystemTime("2026-10-19T08:00:00Z");
    await sendWeeklyReportDigestActivity();
    expect(mocks.send.mock.calls[3][1].toISOString()).toBe(periodEnd);
    expect(mocks.switches).toHaveBeenCalledTimes(4);
  } finally {
    vi.useRealTimers();
  }
});
it("INV-7 legacy read-only demo performs no project read, record work or send", async () => {
  vi.stubEnv("DEMO_USER_ID", "usr_abcdefghijklmnopqrstuvwx");
  vi.stubEnv("DEMO_PROJECT_ID", "prj_abcdefghijklmnopqrstuvwx");
  vi.stubEnv("READ_ONLY_DEMO", "1");
  expect(await sendWeeklyReportDigestActivity()).toEqual({
    projects: 0,
    sent: 0,
    skipped: 0,
    ambiguous: 0,
  });
  expect(mocks.projects).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.switches).not.toHaveBeenCalled();
});
it("editable demo sends digests like a normal deployment; the Viewer filter is per recipient", async () => {
  vi.stubEnv("DEMO_MODE", "editable");
  vi.stubEnv("DEMO_USER_ID", "usr_abcdefghijklmnopqrstuvwx");
  vi.stubEnv("DEMO_OWNER_ID", "usr_bcdefghijklmnopqrstuvwxy");
  vi.stubEnv("DEMO_PROJECT_ID", "prj_abcdefghijklmnopqrstuvwx");
  expect(await sendWeeklyReportDigestActivity()).toMatchObject({ projects: 1, sent: 1 });
  expect(mocks.send).toHaveBeenCalledWith("project", expect.any(Date), false);
});
it("WD-9 never calls the operator notice policy during a digest run and records ambiguous outcomes", async () => {
  expect(await sendWeeklyReportDigestActivity()).toMatchObject({ ambiguous: 1, sent: 1 });
  expect(planRecoveryNotice).not.toHaveBeenCalled();
  expect(mocks.switches).toHaveBeenCalledOnce();
  expect(mocks.send).toHaveBeenCalledWith("project", expect.any(Date), false);
});
it("processes every project before throwing for retryable recipients", async () => {
  mocks.projects.mockResolvedValue([{ id: "one" }, { id: "two" }]);
  mocks.send.mockResolvedValueOnce({ status: "sent", failed: 1, ambiguous: 0 });
  await expect(sendWeeklyReportDigestActivity()).rejects.toThrow("retryable failures");
  expect(mocks.send).toHaveBeenCalledTimes(2);
});

afterEach(() => vi.unstubAllEnvs());
it("an all-skipped development project does not throw or count a retryable failure", async () => {
  vi.stubEnv("DEPLOYMENT_ENV", "development");
  vi.stubEnv("NODE_ENV", "test");
  mocks.send.mockResolvedValue({
    status: "sent",
    recipients: 0,
    skippedRecipients: 1,
    failed: 0,
    ambiguous: 0,
  });
  await expect(sendWeeklyReportDigestActivity()).resolves.toEqual({
    projects: 1,
    sent: 1,
    skipped: 0,
    ambiguous: 0,
  });
});
it("a production no-provider failure still throws the retryable error", async () => {
  vi.stubEnv("DEPLOYMENT_ENV", "production");
  vi.stubEnv("NODE_ENV", "test");
  mocks.send.mockResolvedValue({
    status: "sent",
    recipients: 0,
    skippedRecipients: 0,
    failed: 1,
    ambiguous: 0,
  });
  await expect(sendWeeklyReportDigestActivity()).rejects.toThrow(
    "Weekly digest has 1 retryable failures.",
  );
});
