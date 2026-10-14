import { signMonitorConsent, verifyMonitorConsent } from "@/lib/local-monitor-launch/consent";
import { occurrenceBody } from "@/lib/local-monitor-launch/identity";
import { command, now } from "@/lib/local-monitor-launch/launch.test-fixture";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import { afterEach, describe, expect, it, vi } from "vitest";
import { monitorRetryApprovalSchema } from "./input-schema";

afterEach(() => vi.unstubAllEnvs());
describe("explicit new paid retry consent", () => {
  it("binds parent scope, original native proof, selected denominator and new priced task set", () => {
    vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
    const retry = monitorRetryApprovalSchema.parse({
      version: 1 as const,
      parentRunId: "lmr_abcdefghijklmnopqrstuvwx",
      parentExpectedCount: 9,
      targetIds: command.targetIds,
      sourceHash: localDigest("scope"),
      selectedProofHash: localDigest("original-native-proof"),
    });
    const binding = {
      actorId: "actor",
      projectId: "project",
      monitorId: command.monitorId,
      monitorVersion: command.expectedVersion,
      revisionId: command.revisionId,
      scheduleIntentId: command.scheduleIntentId,
      connectionId: command.connectionId,
      connectionStamp: "stamp",
      targetIds: command.targetIds,
      idempotencyKey: command.idempotencyKey,
      quote: command.quote,
      retry,
    };
    const signed = signMonitorConsent(binding, now);
    expect(() => verifyMonitorConsent(signed.token, binding, now)).not.toThrow();
    for (const changed of [
      { parentRunId: "lmr_bbcdefghijklmnopqrstuvwx" },
      { parentExpectedCount: 8 },
      { selectedProofHash: localDigest("changed-proof") },
      { sourceHash: localDigest("changed-revision") },
    ])
      expect(() =>
        verifyMonitorConsent(
          signed.token,
          { ...binding, retry: monitorRetryApprovalSchema.parse({ ...retry, ...changed }) },
          now,
        ),
      ).toThrow();
    expect(occurrenceBody({ ...command, retry }, "actor")).not.toBe(
      occurrenceBody(command, "actor"),
    );
  });
});
