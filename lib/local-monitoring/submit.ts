import type {
  LocalJournalPort,
  LocalOperationStore,
  LocalSubmitCollectAdapter,
  SubmissionClaim,
  SubmissionOutcome,
} from "./execution-types";
import { createPointRevision } from "./geometry";
import { assertLocalQuote, type LocalQuote, localQuoteHash } from "./quote";
import { persistSubmissionEvent } from "./submission-events";
import { assertSubmissionBinding, validateSubmissionOutcome } from "./submission-state";
import { executionTargetKey, operationKey } from "./target-key";
import type { ExecutionTargetV1, OperationScope, PointRevision } from "./types";

export async function submitLocalTarget(input: {
  scope: OperationScope;
  target: ExecutionTargetV1;
  point: PointRevision;
  quote: LocalQuote;
  adapter: LocalSubmitCollectAdapter;
  journal: LocalJournalPort;
  store: LocalOperationStore;
  clock: () => Date;
}) {
  const snapshot = structuredClone({
    scope: input.scope,
    target: input.target,
    point: input.point,
    quote: input.quote,
  });
  const { scope, target, point, quote } = snapshot;
  const canonicalPoint = createPointRevision({ revisionId: point.revisionId, ...point.coordinate });
  if (
    scope.projectId !== target.projectId ||
    target.pointRevision !== point.revisionKey ||
    point.version !== 1 ||
    point.geometryModel !== canonicalPoint.geometryModel ||
    point.precision !== 7 ||
    point.revisionKey !== canonicalPoint.revisionKey ||
    point.contentHash !== canonicalPoint.contentHash ||
    point.coordinate.latitude !== canonicalPoint.coordinate.latitude ||
    point.coordinate.longitude !== canonicalPoint.coordinate.longitude
  ) {
    throw new Error("Target, point revision and operation scope mismatch");
  }
  const claim: SubmissionClaim = {
    key: operationKey(scope),
    scope,
    targetKey: executionTargetKey(target),
    quoteHash: localQuoteHash(quote),
    provider: quote.provider,
    adapterVersion: quote.adapterVersion,
    providerPriceVersion: quote.providerPriceVersion,
  };
  const retained = await input.store.read(claim.key);
  if (retained) {
    assertSubmissionBinding(retained, claim);
    return { fresh: false, record: retained };
  }
  const assertCurrentQuote = () =>
    assertLocalQuote({
      quote,
      target,
      capability: input.adapter.capability,
      providerPriceVersion: input.adapter.providerPriceVersion,
      now: input.clock(),
    });
  assertCurrentQuote();
  const claimed = await input.store.claim(claim);
  assertSubmissionBinding(claimed.record, claim);
  if (!claimed.fresh) return claimed;
  let record = claimed.record;
  // The durable claim already blocks rebuy if preparation or persistence fails before fencing.
  const request = structuredClone(input.adapter.buildRequest({ target, point, quote }));
  const prepared = await input.journal.prepare({ attemptKey: claim.key, request });
  await input.adapter.assertPreparedQuote(prepared.request, quote);
  assertCurrentQuote();
  record = await persistSubmissionEvent(input.store, record, {
    kind: "possible_send",
    attemptId: prepared.attemptId,
  });
  await input.journal.beforeDispatch(prepared.attemptId);
  assertCurrentQuote();
  let outcome: SubmissionOutcome;
  try {
    outcome = structuredClone(await input.adapter.submit(prepared.request));
    validateSubmissionOutcome(outcome);
  } catch {
    outcome = {
      acceptance: "unknown",
      taskIds: [],
      receivedAt: input.clock().toISOString(),
      usage: { cached: false, costCents: null, quantity: null, failed: true },
    };
  }
  record = await persistSubmissionEvent(input.store, record, {
    kind: "outcome",
    attemptId: prepared.attemptId,
    outcome,
  });
  await input.journal.settle(prepared.attemptId, outcome.usage);
  record = await persistSubmissionEvent(input.store, record, {
    kind: "settlement",
    attemptId: prepared.attemptId,
  });
  return { fresh: true, record };
}
