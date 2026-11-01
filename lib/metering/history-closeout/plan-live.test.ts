import { canonical, encode, hash } from "@/lib/metering/store/codec";
import { describe, expect, it } from "vitest";
import { closeoutPolicy, liveConnectionCloseoutPolicy } from "./manifest";
import { planCloseout } from "./plan";
import { closeoutFixture, liveCloseoutFixture } from "./plan.test-fixture";

it("closes a known-cost import on its existing BYOK connection under the explicit live policy", () => {
  const { snapshot, manifest, now } = liveCloseoutFixture();
  const plan = planCloseout(snapshot, manifest, now);
  expect(plan.planHash).toMatch(/^[a-f0-9]{64}$/);
  const receipt = plan.corrections[0]!.receipt as { metadata?: Record<string, unknown> };
  expect(receipt.metadata?.historicalCloseout).toMatchObject({
    policy: liveConnectionCloseoutPolicy,
    disposition: "financially_closed_identity_incomplete",
    providerIdentity: "unknown",
  });
  const v1 = closeoutFixture();
  expect(planCloseout(v1.snapshot, v1.manifest, v1.now).planHash).not.toBe(plan.planHash);
});

it("keeps v1 refusing retained connection identity, so a live connection never qualifies there", () => {
  const { snapshot, manifest, now } = liveCloseoutFixture();
  snapshot.live = null;
  expect(() => planCloseout(snapshot, { ...manifest, policy: closeoutPolicy }, now)).toThrow(
    "Active, revised",
  );
  const live = liveCloseoutFixture();
  expect(() =>
    planCloseout(live.snapshot, { ...live.manifest, policy: closeoutPolicy }, live.now),
  ).toThrow("policy and snapshot disagree");
});

const rate = (overrides: Record<string, unknown>) => ({
  kind: "rate",
  source_id: "rate",
  payload: {
    id: "rate",
    connectionId: "connection",
    feature: "rank_check",
    amountCents: "0.2",
    ...overrides,
  },
});

it("accepts a retained rate that matches the live connection", () => {
  const { snapshot, manifest, now } = liveCloseoutFixture();
  snapshot.live!.retainedSettings.push(rate({ provider: "dataforseo", projectId: "project" }));
  expect(planCloseout(snapshot, manifest, now).corrections).toHaveLength(1);
});

describe("live connection guards", () => {
  type Live = ReturnType<typeof liveCloseoutFixture>;
  it.each<[string, (f: Live) => void, string]>([
    ["a deleted connection", (f) => (f.snapshot.live!.connection = null), "existing connection"],
    [
      "a hosted connection",
      (f) => (f.snapshot.live!.connection!.credentialSource = "hosted"),
      "hosted connections are refused",
    ],
    [
      "another project's connection",
      (f) => (f.snapshot.live!.connection!.projectId = "other-project"),
      "belong to the manifest project",
    ],
    ["no live facts", (f) => (f.snapshot.live = null), "existing connection"],
    ["an unknown cutoff", (f) => (f.snapshot.live!.cutoff = null), "cutoff is unavailable"],
    [
      "an operation created after the original snapshot",
      (f) => (f.snapshot.live!.cutoff = "2026-09-30T00:00:00.000Z"),
      "created before the original history snapshot",
    ],
    [
      "a retained snapshot naming a different provider",
      (f) => {
        f.snapshot.live!.retainedSettings[0]!.payload = {
          id: "connection",
          projectId: "project",
          provider: "serpapi",
        };
      },
      "describe only this live connection",
    ],
    [
      "a retained snapshot of another project",
      (f) => {
        f.snapshot.live!.retainedSettings[0]!.payload = {
          id: "connection",
          projectId: "other-project",
          provider: "dataforseo",
        };
      },
      "describe only this live connection",
    ],
    [
      "inconsistent retained identity facts",
      (f) => (f.snapshot.entries[0]!.facts.retainedIdentity = false),
      "Retained connection settings changed",
    ],
    [
      "a connection that has no retained snapshot (re-created after the import)",
      (f) => {
        f.snapshot.live!.retainedSettings = [];
        f.snapshot.entries[0]!.facts.retainedIdentity = false;
      },
      "exactly one retained connection snapshot",
    ],
    [
      "a connection retained only through its rates",
      (f) => (f.snapshot.live!.retainedSettings = [rate({})]),
      "exactly one retained connection snapshot",
    ],
    [
      "a duplicated retained connection snapshot",
      (f) => f.snapshot.live!.retainedSettings.push({ ...f.snapshot.live!.retainedSettings[0]! }),
      "exactly one retained connection snapshot",
    ],
    [
      "a retained rate of another provider",
      (f) => f.snapshot.live!.retainedSettings.push(rate({ provider: "serpapi" })),
      "describe only this live connection",
    ],
    [
      "a retained rate of another project",
      (f) => f.snapshot.live!.retainedSettings.push(rate({ projectId: "other-project" })),
      "describe only this live connection",
    ],
    [
      "a retained rate of another connection",
      (f) => f.snapshot.live!.retainedSettings.push(rate({ connectionId: "other-connection" })),
      "describe only this live connection",
    ],
    [
      "a retained rate with an unexpected identity key",
      (f) => f.snapshot.live!.retainedSettings.push(rate({ credentialId: "other-key" })),
      "describe only this live connection",
    ],
    [
      "a retained connection snapshot with an unexpected identity key",
      (f) => {
        f.snapshot.live!.retainedSettings[0]!.payload = {
          id: "connection",
          projectId: "project",
          provider: "dataforseo",
          credentialSource: "hosted",
        };
      },
      "describe only this live connection",
    ],
    [
      "an operation scoped to a different connection than the manifest",
      (f) => {
        f.manifest.connection = "other-connection";
        f.snapshot.live!.connection!.id = "other-connection";
        f.snapshot.live!.retainedSettings = [
          {
            kind: "connection",
            source_id: "other-connection",
            payload: { id: "other-connection", projectId: "project", provider: "dataforseo" },
          },
        ];
      },
      "Historical project, connection or namespace mismatch",
    ],
  ])("refuses %s", (_, mutate, message) => {
    const f = liveCloseoutFixture();
    mutate(f);
    expect(() => planCloseout(f.snapshot, f.manifest, f.now)).toThrow(message);
  });

  it.each(["binding", "evidence", "reference"] as const)("still refuses %s", (field) => {
    const { snapshot, manifest, now } = liveCloseoutFixture();
    snapshot.entries[0]!.facts[field] = true;
    expect(() => planCloseout(snapshot, manifest, now)).toThrow("Active, revised");
  });

  const reseal = (f: Live) => {
    const entry = f.snapshot.entries[0]!;
    entry.journal.target_hash = hash(canonical(entry.operation));
    entry.journal.body = JSON.parse(encode({ input: entry.operation, operation: entry.operation }));
  };
  it.each<[string, (f: Live) => void, string]>([
    [
      "a lease",
      (f) => {
        f.snapshot.entries[0]!.operation.lease = {
          leaseId: "lease",
          holder: "worker",
          expiresAt: "2026-10-18T13:00:00.000Z",
        };
        reseal(f);
      },
      "Active, revised",
    ],
    ["a recovery lease kind", (f) => (f.snapshot.entries[0]!.leaseKind = "recovery"), "Active"],
    [
      "an estimate",
      (f) => {
        f.snapshot.entries[0]!.operation.estimate = [{ unit: "cents", value: 1n, scale: 0 }];
        reseal(f);
      },
      "Active, revised",
    ],
    ["a prior command", (f) => (f.snapshot.entries[0]!.facts.commands = 1n), "Active, revised"],
    [
      "retained native proof",
      (f) => {
        f.snapshot.entries[0]!.proofs = [{} as never];
      },
      "unchanged original import",
    ],
  ])("still refuses %s", (_, mutate, message) => {
    const f = liveCloseoutFixture();
    mutate(f);
    expect(() => planCloseout(f.snapshot, f.manifest, f.now)).toThrow(message);
  });

  it("still refuses native/custom budgets and an ineligible actor digest", () => {
    const f = liveCloseoutFixture();
    f.snapshot.entries[0]!.budgets.push({
      id: "quota",
      version: 1,
      scope: { kind: "connection", namespace: "test", connection: "connection" },
      surface: "any",
      unit: "units",
      limit: null,
      window: { kind: "calendar_month", timezone: "UTC" },
      onExceed: "block",
    });
    expect(() => planCloseout(f.snapshot, f.manifest, f.now)).toThrow("Native/custom budgets");
    const g = liveCloseoutFixture();
    g.snapshot.actor!.isInstanceAdmin = false;
    expect(planCloseout(g.snapshot, g.manifest, g.now)).toMatchObject({
      planHash: null,
      corrections: [],
    });
  });
});

it("binds connection identity, credential source and cutoff into the digest", () => {
  const original = liveCloseoutFixture();
  const digest = planCloseout(original.snapshot, original.manifest, original.now).planHash;
  const provider = liveCloseoutFixture();
  provider.snapshot.live!.connection!.provider = "serpapi";
  provider.snapshot.live!.retainedSettings[0]!.payload = {
    id: "connection",
    projectId: "project",
    provider: "serpapi",
  };
  expect(planCloseout(provider.snapshot, provider.manifest, provider.now).planHash).not.toBe(
    digest,
  );
  const cutoff = liveCloseoutFixture();
  cutoff.snapshot.live!.cutoff = "2026-10-11T02:10:00.001Z";
  expect(planCloseout(cutoff.snapshot, cutoff.manifest, cutoff.now).planHash).not.toBe(digest);
});

it("replays an exact sealed live batch although the connection identity is retained", () => {
  const { snapshot, manifest, now } = liveCloseoutFixture();
  const plan = planCloseout(snapshot, manifest, now);
  const entry = snapshot.entries[0]!;
  entry.operation = {
    ...entry.operation,
    state: "settled",
    version: 2,
    receipts: [...entry.operation.receipts, plan.corrections[0]!.receipt],
  };
  entry.disposition = {
    manifestHash: plan.manifestHash,
    planHash: plan.planHash!,
    targetHash: plan.targetHash,
    finalOperation: structuredClone(entry.operation),
  };
  expect(planCloseout(snapshot, manifest, now)).toMatchObject({
    replayed: true,
    planHash: plan.planHash,
  });
  expect(() => planCloseout(snapshot, { ...manifest, policy: closeoutPolicy }, now)).toThrow(
    "replay conflicts",
  );
});
