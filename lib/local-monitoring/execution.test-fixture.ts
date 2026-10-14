import { createMeter } from "@usagekit/meter";
import { createCatalog, dataforseo, PricedRequest } from "@usagekit/providers";
import { createManualClock, createMemoryStore } from "@usagekit/store";
import {
  type LocalJournalPort,
  LocalOperationConflict,
  type LocalOperationStore,
  type LocalSubmitCollectAdapter,
  LocalTargetBlocked,
  type SubmissionClaim,
  type SubmissionEvent,
  type SubmissionOutcome,
  type SubmissionRecord,
} from "./execution-types";
import {
  localCapabilityFixture,
  localFixtureNow,
  localQuoteFixture,
  localSelectionFixture,
} from "./fixtures";
import {
  applySubmissionEvent,
  assertSubmissionBinding,
  initialSubmission,
} from "./submission-state";
import { executionTargetKey, operationKey } from "./target-key";

export class FixtureOperationStore implements LocalOperationStore {
  readonly records = new Map<string, SubmissionRecord>();
  readonly events: SubmissionEvent[] = [];
  failEvent: SubmissionEvent["kind"] | null = null;
  async read(key: string) {
    return structuredClone(this.records.get(key) ?? null);
  }
  async claim(input: SubmissionClaim) {
    const retained = this.records.get(input.key);
    if (retained) {
      assertSubmissionBinding(retained, input);
      return { fresh: false, record: structuredClone(retained) };
    }
    const owner = [...this.records.values()].find(
      (record) =>
        record.scope.projectId === input.scope.projectId &&
        record.targetKey === input.targetKey &&
        !(record.status === "rejected" && record.settlementRecorded) &&
        !(record.status === "accepted" && record.settlementRecorded && record.collectedEvidenceId),
    );
    if (owner) throw new LocalTargetBlocked(owner.key);
    const record = initialSubmission(input);
    this.records.set(input.key, record);
    return { fresh: true, record: structuredClone(record) };
  }
  async apply(key: string, expectedVersion: number, event: SubmissionEvent) {
    if (this.failEvent === event.kind) throw new Error("Synthetic persistence failure");
    const record = this.records.get(key);
    if (!record || record.version !== expectedVersion) throw new LocalOperationConflict();
    const next = applySubmissionEvent(record, event);
    this.records.set(key, next);
    this.events.push(structuredClone(event));
    return structuredClone(next);
  }
}

export function executionFixture() {
  const { grid, targets } = localSelectionFixture(1);
  const point = grid.points[0].point;
  const target = targets[0];
  const scope = {
    projectId: target.projectId,
    operation: "local_scan_submit" as const,
    idempotencyKey: "synthetic-scan-one-target",
  };
  const quote = localQuoteFixture([executionTargetKey(target)]);
  const store = new FixtureOperationStore();
  const trace: string[] = [];
  const state = {
    submitCalls: 0,
    collectCalls: 0,
    failSubmit: false,
    failSettle: false,
    failNormalize: false,
    acceptedUnknown: false,
  };
  const clock = createManualClock(localFixtureNow.toISOString());
  const catalog = createCatalog({ providers: [dataforseo], enabled: ["dataforseo"] });
  const meter = createMeter({
    store: createMemoryStore({ budgets: [], clock }),
    clock,
    catalog,
    resolveConnection: () => ({ provider: "dataforseo", fundingSource: "byok" }),
  });
  const journal: LocalJournalPort = {
    async prepare({ attemptKey, request }) {
      trace.push("prepare");
      const priced = await PricedRequest.price({
        meter,
        catalog,
        request,
        input: {
          operationId: attemptKey,
          provider: "dataforseo",
          scope: {
            namespace: "synthetic-local",
            principal: scope.projectId,
            connection: "synthetic-connection",
          },
          source: "app",
          surface: "app",
          fundingSource: "byok",
          costOwner: scope.projectId,
        },
      });
      return { attemptId: attemptKey, request: priced };
    },
    async beforeDispatch() {
      trace.push("fence");
    },
    async settle() {
      trace.push("settle");
      if (state.failSettle) throw new Error("Synthetic settlement failure");
    },
  };
  const adapter: LocalSubmitCollectAdapter = {
    capability: structuredClone(localCapabilityFixture),
    providerPriceVersion: quote.providerPriceVersion,
    buildRequest() {
      return {
        method: "POST",
        url: "/v3/serp/google/organic/task_post",
        body: [{ keyword: "synthetic", depth: 20 }],
      };
    },
    async assertPreparedQuote(request) {
      if (!(request instanceof PricedRequest))
        throw new Error("Synthetic adapter requires the nominal priced request");
      trace.push("quote");
    },
    async submit() {
      state.submitCalls += 1;
      trace.push("submit");
      const record = await store.read(operationKey(scope));
      if (record?.status !== "unknown_acceptance" || !record.attemptId || !trace.includes("fence"))
        throw new Error("Submit happened without durable intent");
      if (state.failSubmit) throw new Error("Synthetic response loss");
      const outcome: SubmissionOutcome = {
        acceptance: state.acceptedUnknown ? "unknown" : "accepted",
        taskIds: ["synthetic-task-1"],
        receivedAt: localFixtureNow.toISOString(),
        usage: {
          cached: false,
          costCents: state.acceptedUnknown ? null : 1,
          quantity: 1,
          failed: false,
          providerRequestId: "synthetic-provider-request",
        },
      };
      return outcome;
    },
    async collect(taskIds) {
      state.collectCalls += 1;
      trace.push("collect");
      return {
        taskIds: [...taskIds],
        observedAt: "2026-10-12T11:58:00.000Z",
        payload: { synthetic: true },
        completeness: "complete",
        completeThrough: 20,
      };
    },
    async assertRetrieval() {
      trace.push("retrieval");
    },
  };
  const evidence = {
    async persist() {
      trace.push("normalize");
      if (!trace.includes("settle")) throw new Error("Normalization preceded accounting");
      if (state.failNormalize) throw new Error("Synthetic normalization failure");
      return { evidenceId: "synthetic-observation-1" };
    },
  };
  return {
    scope,
    target,
    point,
    quote,
    adapter,
    journal,
    store,
    trace,
    state,
    evidence,
    clock: () => localFixtureNow,
  };
}
