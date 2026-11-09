import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ receipt: vi.fn(), collect: vi.fn(), send: vi.fn(), finish: vi.fn() }));
vi.mock("@/lib/activity/result-receipt-extension", () => ({ recordResultReceipt: m.receipt }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  project: { findFirst: async () => ({ id: "p" }) }, auditLog: { findFirst: async () => null },
} }));
vi.mock("@/lib/demo/config", () => ({ readOnlyDemoConfig: () => false }));
vi.mock("@/lib/email/send", () => ({ sendEmail: m.send }));
vi.mock("@/lib/email/notification-unsubscribe", () => ({ notificationUnsubscribeUrl: () => "https://example.test", notificationUnsubscribeFooter: () => ({}) }));
vi.mock("@/lib/seo/origin", () => ({ resolveCanonicalOrigin: () => "https://example.test" }));
vi.mock("./weekly-digest-recipients", () => ({ digestUserSelect: { notificationPreferences: {} }, digestCandidates: () => ["a"], digestRecipient: async () => "a@example.test" }));
vi.mock("./weekly-digest-data", () => ({ collectWeeklyDigestData: m.collect }));
vi.mock("./weekly-digest-email", () => ({ renderWeeklyDigestEmail: () => ({}) }));
vi.mock("./weekly-digest-records", () => ({ claimDigest: async () => true, finishDigest: m.finish }));
vi.mock("./weekly-digest-finalize", () => ({ digestSentAction: "sent", finalizeDigest: async () => ({ sent: 1 }) }));
import { sendWeeklyDigestForProject } from "./weekly-digest-send";
beforeEach(() => { vi.resetAllMocks(); });
it.each([[1, false, true], [0, false, false], [1, true, false]])("records only delivered result-bearing mail (%s,%s)", async (checkedKeywords, incidentOnly, nonEmpty) => {
  m.collect.mockResolvedValue({ checkedKeywords, incidentOnly, failedChecksCount: 0, topMovers: [] });
  await sendWeeklyDigestForProject("p", new Date(), false);
  expect(m.receipt).toHaveBeenCalledWith({ userId: "a", surface: "email", nonEmpty });
  expect(m.finish.mock.invocationCallOrder[0]).toBeLessThan(m.receipt.mock.invocationCallOrder[0]);
});
it("does not record a failed handoff", async () => {
  m.collect.mockResolvedValue({ checkedKeywords: 1, failedChecksCount: 0, topMovers: [] });
  m.send.mockRejectedValue(new Error("failed"));
  await sendWeeklyDigestForProject("p", new Date(), false);
  expect(m.receipt).not.toHaveBeenCalled();
});
