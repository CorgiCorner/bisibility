import type { LocalMonitorScheduleIntent } from "@/lib/generated/prisma/client";
import { calendar } from "@/lib/local-monitor-recurring/recurring.test-fixture";
import { definitionSourceFixture } from "@/lib/measurement-definitions/fixtures";
import type { HostPolicySnapshot } from "@/lib/measurement-definitions/host-policy-contract";
import { describe, expect, it } from "vitest";
import { localResultFixture } from "./fixture";
import { localFreshnessFromIntent } from "./freshness";

function fixture() {
  const f = localResultFixture(),
    config = definitionSourceFixture().policy.config;
  if (!config) throw new Error("Actual synthetic policy fixture missing");
  const intent: LocalMonitorScheduleIntent = {
    id: "intent",
    projectId: f.binding.run.projectId,
    monitorId: f.binding.occurrence.monitorId,
    definitionRevisionId: f.binding.revision.id,
    previousRevisionId: null,
    revision: 1,
    mode: "manual",
    scheduleId: null,
    snapshot: null,
    approvalDigest: null,
    capabilityVersion: null,
    actorId: null,
    createdAt: f.binding.occurrence.createdAt,
  };
  const policy: HostPolicySnapshot = { state: "ready", policyEpoch: "8", config };
  return { ...f, intent, policy, config };
}
describe("actual persisted freshness with original Local intent", () => {
  it("uses explicit manual TTL including zero without replacing null by a made-up default", () => {
    const f = fixture();
    expect(localFreshnessFromIntent(f.binding, f.intent, f.policy, f.now)).toMatchObject({
      basis: "manual_ttl",
      freshForMs: 12345,
    });
    for (const ttl of [0, null])
      expect(
        localFreshnessFromIntent(
          f.binding,
          f.intent,
          {
            ...f.policy,
            config: { ...f.config, freshness: { ...f.config.freshness, manualTtlMs: ttl } },
          },
          f.now,
        ).freshForMs,
      ).toBe(ttl);
  });
  it.each(["unconfigured", "unsupported", "authority_unavailable"] as const)(
    "keeps %s policy unknown",
    (state) => {
      const f = fixture();
      expect(
        localFreshnessFromIntent(
          f.binding,
          f.intent,
          { state, policyEpoch: "9", config: null },
          f.now,
        ),
      ).toMatchObject({ basis: null, freshForMs: null, freshnessReason: "policy_unavailable" });
    },
  );
  it.each([
    { projectId: "foreign" },
    { monitorId: "foreign" },
    { definitionRevisionId: "foreign" },
    { id: "foreign" },
    { createdAt: new Date("2027-01-01T00:00:00.000Z") },
  ])("does not borrow an unrelated or future intent: %j", (change) => {
    const f = fixture();
    expect(
      localFreshnessFromIntent(f.binding, { ...f.intent, ...change }, f.policy, f.now),
    ).toMatchObject({ freshForMs: null, freshnessReason: "invalid_policy" });
  });
  it.each([
    ["2026-10-24T00:00:00.000Z", 25],
    ["2026-03-28T00:00:00.000Z", 23],
  ])("uses the actual captured monitor calendar around DST at %s", (asOf, hours) => {
    const f = fixture(),
      captured = {
        ...f.binding,
        occurrence: {
          ...f.binding.occurrence,
          mode: "scheduled",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      },
      intent = {
        ...f.intent,
        mode: "scheduled",
        createdAt: captured.occurrence.createdAt,
        scheduleId: calendar.scheduleId,
        snapshot: { ...calendar, timeOfDay: "04:00" },
      },
      policy = {
        ...f.policy,
        config: { ...f.config, freshness: { ...f.config.freshness, cadenceGraceMs: 1500 } },
      };
    expect(localFreshnessFromIntent(captured, intent, policy, new Date(asOf))).toMatchObject({
      basis: "captured_calendar",
      freshForMs: hours * 3600000 + 1500,
      policyEpoch: "8",
      semantics: "current_project_policy_with_original_intent",
    });
  });
});
