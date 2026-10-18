import { canonical, encode, hash } from "@/lib/metering/store/codec";
import { describe, expect, it } from "vitest";
import { closeoutManifest } from "./manifest";
import { planCloseout } from "./plan";
import { closeoutFixture } from "./plan.test-fixture";

it("keeps original unknown native evidence and exact money, with an explicitly financial-only import", () => {
  const { snapshot, manifest, now } = closeoutFixture();
  const before = canonical(snapshot);
  const plan = planCloseout(snapshot, manifest, now);
  const receipt = plan.corrections[0]!.receipt;
  expect(receipt.source).toBe("import");
  expect(receipt.providerRequestId).toBeUndefined();
  expect(receipt.cost).toEqual(snapshot.entries[0]!.operation.receipts[0]!.cost);
  expect(receipt.occurredAt).toBe("2026-10-01T00:00:00.000Z");
  expect(receipt.measurements.map((m) => m.unit)).toEqual([
    "cents",
    "budget_cents",
    "paid_attempts",
  ]);
  expect(receipt.measurements.at(-1)?.quantity?.value).toBe(1n);
  expect(canonical(snapshot)).toBe(before);
});

describe("strict immutable eligibility", () => {
  it.each(["binding", "evidence", "reference", "retainedIdentity"] as const)(
    "refuses %s",
    (field) => {
      const { snapshot, manifest, now } = closeoutFixture();
      snapshot.entries[0]!.facts[field] = true;
      expect(() => planCloseout(snapshot, manifest, now)).toThrow("Active, revised");
    },
  );
  it.each(["units", "tokens", "customer_cents"])(
    "refuses the %s budget even when currently unlimited",
    (unit) => {
      const { snapshot, manifest, now } = closeoutFixture();
      snapshot.entries[0]!.budgets.push({
        id: "quota",
        version: 1,
        scope: { kind: "group", namespace: "test", group: "project" },
        surface: "any",
        unit,
        limit: null,
        window: { kind: "calendar_month", timezone: "UTC" },
        onExceed: "block",
      });
      expect(() => planCloseout(snapshot, manifest, now)).toThrow("Native/custom budgets");
    },
  );
  it("allows attached paid attempts, but refuses a retrospective alert", () => {
    const { snapshot, manifest, now } = closeoutFixture();
    snapshot.entries[0]!.budgets.push({
      id: "attempts",
      version: 1,
      scope: { kind: "group", namespace: "test", group: "project" },
      surface: "any",
      unit: "paid_attempts",
      limit: null,
      window: { kind: "calendar_month", timezone: "UTC" },
      onExceed: "block",
    });
    expect(planCloseout(snapshot, manifest, now).corrections).toHaveLength(1);
    snapshot.entries[0]!.budgets[0]!.alerts = [
      { at: { unit: "paid_attempts", value: 1n, scale: 0 } },
    ];
    expect(() => planCloseout(snapshot, manifest, now)).toThrow("retrospective budget alerts");
  });
  it("refuses forged monetary dimensions even with a self-consistent journal", () => {
    const { snapshot, manifest, now } = closeoutFixture();
    const entry = snapshot.entries[0]!;
    entry.operation.receipts[0]!.cost = {
      certainty: "measured",
      money: { currency: "USD", units: 999n },
    };
    entry.journal.target_hash = hash(canonical(entry.operation));
    entry.journal.body = JSON.parse(encode({ input: entry.operation, operation: entry.operation }));
    expect(() => planCloseout(snapshot, manifest, now)).toThrow("Measured nonnegative USD");
  });
  it("refuses future/stale timestamps and stale versions", () => {
    const { snapshot, manifest, now } = closeoutFixture();
    expect(() =>
      planCloseout(snapshot, { ...manifest, recordedAt: "2026-10-19T12:00:00.000Z" }, now),
    ).toThrow("nonfuture");
    expect(() =>
      planCloseout(snapshot, { ...manifest, recordedAt: "2026-10-16T12:00:00.000Z" }, now),
    ).toThrow("current");
    manifest.operations[0]!.expectedVersion = 2;
    expect(() => planCloseout(snapshot, manifest, now)).toThrow("Active, revised");
  });
});

it("binds target, role, actor, evidence and full budget configuration; schema rollout itself is not a change", () => {
  const { snapshot, manifest, now } = closeoutFixture();
  const original = planCloseout(snapshot, manifest, now).planHash;
  snapshot.schemaAvailable = false;
  expect(planCloseout(snapshot, manifest, now).planHash).toBe(original);
  snapshot.identity.role = "different";
  expect(planCloseout(snapshot, manifest, now).planHash).not.toBe(original);
  snapshot.identity.role = "fixture";
  manifest.evidenceRef += ":updated";
  expect(planCloseout(snapshot, manifest, now).planHash).not.toBe(original);
});

it("accepts only the exact whole sealed replay and refuses mixed/conflicting batches", () => {
  const { snapshot, manifest, now } = closeoutFixture();
  const plan = planCloseout(snapshot, manifest, now);
  snapshot.entries[0]!.operation = {
    ...snapshot.entries[0]!.operation,
    state: "settled",
    version: 2,
    receipts: [...snapshot.entries[0]!.operation.receipts, plan.corrections[0]!.receipt],
  };
  snapshot.entries[0]!.disposition = {
    manifestHash: plan.manifestHash,
    planHash: plan.planHash!,
    targetHash: plan.targetHash,
    finalOperation: structuredClone(snapshot.entries[0]!.operation),
  };
  expect(planCloseout(snapshot, manifest, now).replayed).toBe(true);
  snapshot.entries[0]!.operation.version++;
  expect(() => planCloseout(snapshot, manifest, now)).toThrow("replay conflicts");
});

it("never emits an approvable digest or corrections for an ineligible actor, while validating original eligibility", () => {
  const { snapshot, manifest, now } = closeoutFixture();
  snapshot.actor!.isInstanceAdmin = false;
  expect(planCloseout(snapshot, manifest, now)).toMatchObject({
    approvalReady: false,
    planHash: null,
    corrections: [],
  });
  snapshot.actor = null;
  expect(planCloseout(snapshot, manifest, now).planHash).toBeNull();
  snapshot.entries[0]!.facts.evidence = true;
  expect(() => planCloseout(snapshot, manifest, now)).toThrow("Active, revised");
});

it("manifest rejects arbitrary amounts/providers, duplicate IDs and unsorted scope", () => {
  const { manifest } = closeoutFixture();
  expect(closeoutManifest.safeParse({ ...manifest, provider: "guessed" }).success).toBe(false);
  expect(
    closeoutManifest.safeParse({
      ...manifest,
      operations: [...manifest.operations, manifest.operations[0]],
    }).success,
  ).toBe(false);
  expect(
    closeoutManifest.safeParse({
      ...manifest,
      operations: [{ ...manifest.operations[0], costCents: "0" }],
    }).success,
  ).toBe(false);
});
