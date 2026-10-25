import { expect, it, vi } from "vitest";
import shellMessages from "@/messages/core/en/shell.json";
import { incidentCopyRenderer } from "@/lib/notifications/incident-copy";
import { digestOperationCounts, type DigestOperationDimensions } from "./weekly-digest-projection";
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }));
const operation: DigestOperationDimensions = {
  acceptance: "unconfirmed",
  fulfillment: "pending",
  accounting: null,
  recoveryState: "operator_review",
  exhaustionStatus: "pending",
  exhaustionReason: null,
};
it("DM-15 projects independent result and cost dimensions; operator state never resolves evidence", async () => {
  const counts = digestOperationCounts([
    operation,
    {
      ...operation,
      acceptance: "accepted",
      fulfillment: "complete",
      accounting: "unknown",
      exhaustionStatus: "exhausted",
      exhaustionReason: "retention ended",
      recoveryState: "resolved",
    },
    { ...operation, fulfillment: "partial", accounting: "measured" },
    { ...operation, acceptance: "rejected", fulfillment: "provider_error", accounting: "conflict" },
    { ...operation, fulfillment: "absent", accounting: "unknown" },
  ]);
  expect(counts).toEqual({
    resultUnderReviewCount: 1,
    resultRecoveredCount: 1,
    resultPartialCount: 1,
    resultProviderErrorCount: 1,
    resultMissingCount: 1,
    costMeasuredCount: 1,
    costUnknownCount: 1,
    costUnderReviewCount: 3,
    costConflictCount: 1,
  });
  const copy = (await incidentCopyRenderer("en"))(counts).body;
  for (const phrase of [
    "1 result under review",
    "1 recovered result",
    "1 partial result",
    "1 provider error",
    "1 missing result",
    "cost measured for 1 check",
    "cost unknown for 1 check",
    "cost under review for 3 checks",
    "cost conflict for 1 check",
    shellMessages.shell.notifications.incident.noRepeat,
  ])
    expect(copy).toContain(phrase);
  expect(copy).not.toMatch(/not submitted|operation|incident ID|dataforseo/i);
  expect((await incidentCopyRenderer("en"))({ costConflictCount: 0 }).body).not.toContain(
    "cost conflict",
  );
});
