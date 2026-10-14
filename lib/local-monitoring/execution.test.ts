import { describe, expect, it } from "vitest";
import { NO_LOCAL_IMPLEMENTATIONS } from "./capability";
import {
  cancelLocalTarget,
  collectLocalTarget,
  reconcileLocalAcceptance,
  resumeLocalSettlement,
} from "./collect";
import { executionFixture } from "./execution.test-fixture";
import type { SubmissionReconciliation, SubmissionRecord } from "./execution-types";
import { localFixtureNow } from "./fixtures";
import { applySubmissionEvent, submissionSettlementReceipt } from "./submission-state";
import { submitLocalTarget } from "./submit";
import { operationKey } from "./target-key";

function originalProof(
  record: SubmissionRecord,
  change: Partial<SubmissionReconciliation> = {},
): SubmissionReconciliation {
  if (!record.attemptId) throw new Error("Fixture must retain the original attempt.");
  return {
    version: 1,
    kind: "provider_receipt",
    proofId: "synthetic-original-proof",
    attemptId: record.attemptId,
    projectId: record.scope.projectId,
    operationKey: record.key,
    targetKey: record.targetKey,
    provider: record.provider,
    adapterVersion: record.adapterVersion,
    device: "desktop",
    verifiedAt: localFixtureNow.toISOString(),
    exhaustive: true,
    outcome: {
      acceptance: "accepted",
      taskIds: ["synthetic-task-1"],
      receivedAt: localFixtureNow.toISOString(),
      usage: {
        cached: false,
        costCents: 1,
        quantity: 1,
        failed: false,
        providerRequestId: "synthetic-provider-request",
      },
    },
    ...change,
  };
}

describe("durable submit/collect without paid fixture I/O", () => {
  it("persists unknown acceptance and fences before submit; settles before normalization", async () => {
    const fixture = executionFixture();
    const result = await submitLocalTarget(fixture);
    expect(result.record).toMatchObject({ status: "accepted", settlementRecorded: true });
    expect(fixture.store.events.map(({ kind }) => kind)).toEqual([
      "possible_send",
      "outcome",
      "settlement",
    ]);
    await collectLocalTarget({ key: result.record.key, ...fixture });
    expect(fixture.trace).toEqual([
      "prepare",
      "quote",
      "fence",
      "submit",
      "settle",
      "retrieval",
      "collect",
      "normalize",
    ]);
    expect(await submitLocalTarget(fixture)).toMatchObject({
      fresh: false,
      record: { status: "accepted" },
    });
    expect(await collectLocalTarget({ key: result.record.key, ...fixture })).toEqual({
      evidenceId: "synthetic-observation-1",
      replayed: true,
    });
    expect(fixture.state.submitCalls).toBe(1);
    expect(fixture.state.collectCalls).toBe(1);
  });
  it("does not repurchase on lost submit response or possible-send receipt persistence failure", async () => {
    const lost = executionFixture();
    lost.state.failSubmit = true;
    const result = await submitLocalTarget(lost);
    expect(result.record.status).toBe("unknown_acceptance");
    expect(result.record.outcome?.usage.costCents).toBeNull();
    expect(await submitLocalTarget(lost)).toMatchObject({ fresh: false });
    await expect(
      submitLocalTarget({
        ...lost,
        scope: { ...lost.scope, idempotencyKey: "another-caller-key" },
      }),
    ).rejects.toThrow("reconcile before repurchase");
    await expect(collectLocalTarget({ key: result.record.key, ...lost })).rejects.toThrow();
    expect(lost.state.submitCalls).toBe(1);
    const persist = executionFixture();
    persist.store.failEvent = "outcome";
    await expect(submitLocalTarget(persist)).rejects.toThrow("persistence");
    expect(await submitLocalTarget(persist)).toMatchObject({
      fresh: false,
      record: { status: "unknown_acceptance" },
    });
    expect(persist.state.submitCalls).toBe(1);
  });
  it("retries accounting from retained evidence without submitting or normalizing twice", async () => {
    const fixture = executionFixture();
    fixture.state.failSettle = true;
    await expect(submitLocalTarget(fixture)).rejects.toThrow("settlement");
    const key = operationKey(fixture.scope);
    await expect(collectLocalTarget({ key, ...fixture })).rejects.toThrow();
    fixture.state.failSettle = false;
    await resumeLocalSettlement({ key, ...fixture });
    fixture.state.failNormalize = true;
    await expect(collectLocalTarget({ key, ...fixture })).rejects.toThrow("normalization");
    fixture.state.failNormalize = false;
    await collectLocalTarget({ key, ...fixture });
    expect(fixture.state.submitCalls).toBe(1);
    expect((await fixture.store.read(key))?.collectedEvidenceId).toBe("synthetic-observation-1");
  });
  it("collects accepted tasks after expiry/cancellation and preserves partial acceptance uncertainty", async () => {
    const fixture = executionFixture();
    fixture.state.acceptedUnknown = true;
    const result = await submitLocalTarget(fixture);
    await cancelLocalTarget(result.record.key, fixture.store);
    fixture.adapter.capability = {
      ...fixture.adapter.capability,
      expiresAt: "2026-10-11T12:00:00.000Z",
    };
    const captured: unknown[] = [];
    await collectLocalTarget({
      key: result.record.key,
      ...fixture,
      evidence: {
        async persist({ result: value }) {
          captured.push(value);
          return { evidenceId: "partial-observation" };
        },
      },
    });
    expect(captured[0]).toMatchObject({
      completeness: "unknown",
      completeThrough: null,
      observedAt: "2026-10-12T11:58:00.000Z",
    });
    expect((await fixture.store.read(result.record.key))?.cancellationRequested).toBe(true);
    expect(fixture.state.submitCalls).toBe(1);
  });
  it("refuses unsupported, stale quote, price or scope before admission", async () => {
    const unsupported = executionFixture();
    unsupported.adapter.capability = {
      ...unsupported.adapter.capability,
      implementations: NO_LOCAL_IMPLEMENTATIONS,
    };
    await expect(submitLocalTarget(unsupported)).rejects.toThrow("not implemented");
    const expired = executionFixture();
    expired.clock = () => new Date("2026-10-12T13:00:00.000Z");
    await expect(submitLocalTarget(expired)).rejects.toThrow("expired");
    const changed = executionFixture();
    changed.adapter.providerPriceVersion = "price-v2";
    await expect(submitLocalTarget(changed)).rejects.toThrow("preview again");
    const scope = executionFixture();
    scope.scope = { ...scope.scope, projectId: "other-project" };
    await expect(submitLocalTarget(scope)).rejects.toThrow("mismatch");
    for (const fixture of [unsupported, expired, changed, scope]) {
      expect(fixture.trace).toEqual([]);
      expect(fixture.state.submitCalls).toBe(0);
    }
  });
  it("checks quote expiry again after asynchronous preparation", async () => {
    const fixture = executionFixture();
    let checks = 0;
    fixture.clock = () => (++checks === 1 ? localFixtureNow : new Date("2026-10-12T13:00:00.000Z"));
    await expect(submitLocalTarget(fixture)).rejects.toThrow("expired");
    expect(fixture.state.submitCalls).toBe(0);
    expect(await submitLocalTarget(fixture)).toMatchObject({
      fresh: false,
      record: { status: "claimed" },
    });
  });
  it("serializes concurrent callers and refuses reusing the caller key for another quote", async () => {
    const fixture = executionFixture();
    await Promise.all([submitLocalTarget(fixture), submitLocalTarget(fixture)]);
    expect(fixture.state.submitCalls).toBe(1);
    await expect(
      submitLocalTarget({
        ...fixture,
        quote: { ...fixture.quote, effectiveOptions: { depth: "100" } },
      }),
    ).rejects.toThrow("another immutable");
  });
  it("refuses a quote expiring while the asynchronous native fence is acquired", async () => {
    const fixture = executionFixture();
    let checks = 0;
    fixture.clock = () => (++checks < 3 ? localFixtureNow : new Date("2026-10-12T13:00:00.000Z"));
    await expect(submitLocalTarget(fixture)).rejects.toThrow("expired");
    expect(fixture.state.submitCalls).toBe(0);
    expect(await submitLocalTarget(fixture)).toMatchObject({
      fresh: false,
      record: { status: "unknown_acceptance" },
    });
  });
  it("cancels before the possible-send fence without dispatch and retains already accepted work", async () => {
    const fixture = executionFixture();
    const prepare = fixture.journal.prepare;
    fixture.journal.prepare = async (input) => {
      const result = await prepare(input);
      await cancelLocalTarget(operationKey(fixture.scope), fixture.store);
      return result;
    };
    await expect(submitLocalTarget(fixture)).rejects.toThrow("cancelled");
    expect(fixture.state.submitCalls).toBe(0);
    expect((await fixture.store.read(operationKey(fixture.scope)))?.status).toBe("cancelled");
  });
});

describe("original acceptance reconciliation through the single submission reducer", () => {
  it("resolves a lost response after cancellation without another prepare, fence or POST", async () => {
    const f = executionFixture();
    f.state.failSubmit = true;
    const original = (await submitLocalTarget(f)).record;
    await cancelLocalTarget(original.key, f.store);
    const proof = originalProof(original);
    const record = await reconcileLocalAcceptance({
      key: original.key,
      proof,
      store: f.store,
      accounting: f.journal,
    });
    expect(record).toMatchObject({
      status: "accepted",
      cancellationRequested: true,
      attemptId: original.attemptId,
      settlementRecorded: true,
      originalOutcome: original.outcome,
    });
    await collectLocalTarget({ key: original.key, ...f });
    expect((await submitLocalTarget(f)).fresh).toBe(false);
    expect(f.trace.filter((v) => ["prepare", "fence", "submit"].includes(v))).toEqual([
      "prepare",
      "fence",
      "submit",
    ]);
    expect(f.state.submitCalls).toBe(1);
    expect(f.state.collectCalls).toBe(1);
  });
  it("retains original proof before failed accounting, then replays proof and settlement idempotently", async () => {
    const f = executionFixture();
    f.state.failSubmit = true;
    const original = (await submitLocalTarget(f)).record;
    const proof = originalProof(original);
    f.state.failSettle = true;
    await expect(
      reconcileLocalAcceptance({ key: original.key, proof, store: f.store, accounting: f.journal }),
    ).rejects.toThrow("settlement");
    const retained = await f.store.read(original.key);
    expect(retained).toMatchObject({
      status: "accepted",
      settlementRecorded: false,
      originalOutcome: original.outcome,
      reconciliationHistory: [proof],
    });
    f.state.failSettle = false;
    const once = await reconcileLocalAcceptance({
      key: original.key,
      proof,
      store: f.store,
      accounting: f.journal,
    });
    const count = f.trace.filter((v) => v === "settle").length;
    const again = await reconcileLocalAcceptance({
      key: original.key,
      proof: {
        ...proof,
        verifiedAt: "2026-10-12T12:01:00.000Z",
        outcome: { ...proof.outcome, receivedAt: "2026-10-12T12:01:00.000Z" },
      },
      store: f.store,
      accounting: f.journal,
    });
    expect(again).toEqual(once);
    expect(f.trace.filter((v) => v === "settle")).toHaveLength(count);
    expect(f.state.submitCalls).toBe(1);
    await expect(
      reconcileLocalAcceptance({
        key: original.key,
        proof: { ...proof, outcome: { ...proof.outcome, taskIds: ["changed-proof"] } },
        store: f.store,
        accounting: f.journal,
      }),
    ).rejects.toThrow("identity conflicts");
  });
  it("recovers an original attempt whose submit outcome failed to persist without recreating its permit", async () => {
    const f = executionFixture();
    f.store.failEvent = "outcome";
    await expect(submitLocalTarget(f)).rejects.toThrow("persistence");
    const record = await f.store.read(operationKey(f.scope));
    if (!record) throw new Error("Fixture record missing.");
    expect(record.outcome).toBeNull();
    const recovered = await reconcileLocalAcceptance({
      key: record.key,
      proof: originalProof(record),
      store: f.store,
      accounting: f.journal,
    });
    expect(recovered).toMatchObject({
      originalOutcome: null,
      status: "accepted",
      attemptId: record.attemptId,
    });
    expect((await submitLocalTarget(f)).fresh).toBe(false);
    expect(f.state.submitCalls).toBe(1);
  });
  it("rejects unrelated custody, nonexhaustive decisions and unprepared attempts", async () => {
    const f = executionFixture();
    f.state.failSubmit = true;
    const record = (await submitLocalTarget(f)).record;
    const proof = originalProof(record);
    for (const change of [
      { projectId: "foreign-project" },
      { attemptId: "other-attempt" },
      { operationKey: "other-operation" },
      { targetKey: "other-target" },
      { provider: "other-provider" },
      { adapterVersion: "other-version" },
    ]) {
      expect(() =>
        applySubmissionEvent(record, {
          kind: "reconciled",
          attemptId: record.attemptId!,
          proof: { ...proof, ...change },
        }),
      ).toThrow("original custody");
    }
    expect(() =>
      applySubmissionEvent(record, {
        kind: "reconciled",
        attemptId: record.attemptId!,
        proof: { ...proof, exhaustive: false },
      }),
    ).toThrow("Exhaustive");
    expect(() =>
      applySubmissionEvent(
        { ...record, status: "claimed", attemptId: null, outcome: null },
        { kind: "reconciled", attemptId: proof.attemptId, proof },
      ),
    ).toThrow("attempt mismatch");
    expect(f.state.submitCalls).toBe(1);
  });
  it("merges proven partial task IDs monotonically and rejects exhaustive removals", async () => {
    const f = executionFixture();
    f.state.acceptedUnknown = true;
    const record = (await submitLocalTarget(f)).record;
    const unknown = originalProof(record, {
      proofId: "partial-more",
      exhaustive: false,
      outcome: {
        ...originalProof(record).outcome,
        acceptance: "unknown",
        taskIds: ["synthetic-task-2"],
        usage: record.outcome!.usage,
      },
    });
    const partial = await reconcileLocalAcceptance({
      key: record.key,
      proof: unknown,
      store: f.store,
      accounting: f.journal,
    });
    expect(partial.outcome?.taskIds).toEqual(["synthetic-task-1", "synthetic-task-2"]);
    expect(partial.status).toBe("unknown_acceptance");
    await expect(
      reconcileLocalAcceptance({
        key: record.key,
        proof: originalProof(record),
        store: f.store,
        accounting: f.journal,
      }),
    ).rejects.toThrow("removes");
    const complete = originalProof(record, {
      proofId: "complete-two",
      outcome: {
        ...originalProof(record).outcome,
        taskIds: ["synthetic-task-2", "synthetic-task-1"],
      },
    });
    const accepted = await reconcileLocalAcceptance({
      key: record.key,
      proof: complete,
      store: f.store,
      accounting: f.journal,
    });
    expect(accepted.status).toBe("accepted");
    expect(accepted.originalOutcome).toEqual(record.outcome);
    expect(submissionSettlementReceipt(accepted).costCents).toBe(1);
  });
  it("rejects acceptance, request identity and known native amount contradictions", async () => {
    const f = executionFixture();
    const record = (await submitLocalTarget(f)).record;
    const proof = originalProof(record);
    const contradictions = [
      { ...proof, outcome: { ...proof.outcome, acceptance: "rejected" as const, taskIds: [] } },
      { ...proof, outcome: { ...proof.outcome, taskIds: ["synthetic-task-1", "new-id"] } },
      { ...proof, outcome: { ...proof.outcome, usage: { ...proof.outcome.usage, costCents: 2 } } },
      {
        ...proof,
        outcome: {
          ...proof.outcome,
          usage: { ...proof.outcome.usage, providerRequestId: "different-native" },
        },
      },
      { ...proof, outcome: { ...proof.outcome, usage: { ...proof.outcome.usage, failed: true } } },
    ];
    for (const conflict of contradictions)
      await expect(
        reconcileLocalAcceptance({
          key: record.key,
          proof: conflict,
          store: f.store,
          accounting: f.journal,
        }),
      ).rejects.toThrow();
    expect(await f.store.read(record.key)).toEqual(record);
    expect(f.state.submitCalls).toBe(1);
  });
  it("never downgrades proven acceptance or native facts from a later incomplete read", async () => {
    const f = executionFixture();
    const record = (await submitLocalTarget(f)).record;
    const incomplete = originalProof(record, {
      proofId: "incomplete-read",
      exhaustive: false,
      outcome: {
        acceptance: "unknown",
        taskIds: [],
        receivedAt: localFixtureNow.toISOString(),
        usage: { cached: false, costCents: null, quantity: null, failed: true },
      },
    });
    const count = f.trace.filter((v) => v === "settle").length;
    const after = await reconcileLocalAcceptance({
      key: record.key,
      proof: incomplete,
      store: f.store,
      accounting: f.journal,
    });
    expect(after).toMatchObject({ status: "accepted", settlementRecorded: true });
    expect(after.outcome?.taskIds).toEqual(record.outcome?.taskIds);
    expect(submissionSettlementReceipt(after)).toEqual(record.outcome?.usage);
    expect(f.trace.filter((v) => v === "settle")).toHaveLength(count);
  });
  it("resolves exhaustive rejection and refuses later accepted IDs", async () => {
    const f = executionFixture();
    f.state.failSubmit = true;
    const record = (await submitLocalTarget(f)).record;
    const rejected = originalProof(record, {
      outcome: {
        acceptance: "rejected",
        taskIds: [],
        receivedAt: localFixtureNow.toISOString(),
        usage: { cached: false, costCents: 0, quantity: 0, failed: true },
      },
    });
    expect(
      await reconcileLocalAcceptance({
        key: record.key,
        proof: rejected,
        store: f.store,
        accounting: f.journal,
      }),
    ).toMatchObject({ status: "rejected", settlementRecorded: true });
    await expect(
      reconcileLocalAcceptance({
        key: record.key,
        proof: originalProof(record, { proofId: "contradictory-acceptance" }),
        store: f.store,
        accounting: f.journal,
      }),
    ).rejects.toThrow("contradicts");
    expect(f.state.submitCalls).toBe(1);
  });
  it("keeps a collected same-set unknown observation immutable when acceptance and money refine", async () => {
    const f = executionFixture();
    f.state.acceptedUnknown = true;
    const record = (await submitLocalTarget(f)).record;
    const persisted: unknown[] = [];
    await collectLocalTarget({
      key: record.key,
      ...f,
      evidence: {
        async persist(value) {
          persisted.push(structuredClone(value.result));
          return { evidenceId: "original-partial-observation" };
        },
      },
    });
    const projection = structuredClone(persisted);
    const refined = await reconcileLocalAcceptance({
      key: record.key,
      proof: originalProof(record),
      store: f.store,
      accounting: f.journal,
    });
    expect(refined).toMatchObject({
      status: "accepted",
      pendingReconciliationReason: null,
      collectedEvidenceId: "original-partial-observation",
    });
    expect(await collectLocalTarget({ key: record.key, ...f })).toEqual({
      evidenceId: "original-partial-observation",
      replayed: true,
    });
    expect(persisted).toEqual(projection);
    expect(persisted[0]).toMatchObject({ completeness: "unknown", completeThrough: null });
    expect(f.state.collectCalls).toBe(1);
    expect(f.state.submitCalls).toBe(1);
  });
  it("retains incompatible extra IDs as pending without changing a collected subset or its completeness", async () => {
    const f = executionFixture();
    f.state.acceptedUnknown = true;
    const record = (await submitLocalTarget(f)).record;
    await collectLocalTarget({ key: record.key, ...f });
    await cancelLocalTarget(record.key, f.store);
    const collected = await f.store.read(record.key);
    const proof = originalProof(record, {
      outcome: {
        ...originalProof(record).outcome,
        taskIds: ["synthetic-task-1", "synthetic-task-2"],
      },
    });
    const pending = await reconcileLocalAcceptance({
      key: record.key,
      proof,
      store: f.store,
      accounting: f.journal,
    });
    expect(pending).toMatchObject({
      status: "unknown_acceptance",
      pendingReconciliationReason: "collected_scope_conflict",
      cancellationRequested: true,
    });
    expect(pending.outcome).toEqual(collected?.outcome);
    expect(pending.reconciliationHistory?.[0].outcome.taskIds).toEqual(proof.outcome.taskIds);
    expect(submissionSettlementReceipt(pending).costCents).toBe(1);
    await expect(
      reconcileLocalAcceptance({
        key: record.key,
        proof: {
          ...proof,
          proofId: "conflict-after-collected-subset",
          outcome: { ...proof.outcome, usage: { ...proof.outcome.usage, failed: true } },
        },
        store: f.store,
        accounting: f.journal,
      }),
    ).rejects.toThrow("established receipt outcome");
    await expect(
      submitLocalTarget({ ...f, scope: { ...f.scope, idempotencyKey: "fresh-after-partial" } }),
    ).rejects.toThrow("reconcile before repurchase");
    expect((await collectLocalTarget({ key: record.key, ...f })).replayed).toBe(true);
    expect(f.state.collectCalls).toBe(1);
    expect(f.state.submitCalls).toBe(1);
  });
});
