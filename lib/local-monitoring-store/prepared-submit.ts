import "server-only";
import type {
  LocalJournalPort,
  LocalOperationStore,
  LocalSubmitCollectAdapter,
  SubmissionOutcome,
} from "@/lib/local-monitoring/execution-types";
import { assertLocalQuote, type LocalQuote } from "@/lib/local-monitoring/quote";
import { persistSubmissionEvent } from "@/lib/local-monitoring/submission-events";
import { validateSubmissionOutcome } from "@/lib/local-monitoring/submission-state";
import type { ExecutionTargetV1 } from "@/lib/local-monitoring/types";
import type { ProviderRequest } from "@usagekit/providers";

/** Host integration for already joined-admitted work; state reduction stays canonical. */
export async function submitPreparedLocalItem(input: {
  key: string;
  target: ExecutionTargetV1;
  quote: LocalQuote;
  request: ProviderRequest;
  store: LocalOperationStore;
  journal: LocalJournalPort;
  adapter: LocalSubmitCollectAdapter;
  clock: () => Date;
}) {
  let record = await input.store.read(input.key);
  if (
    !record ||
    record.status !== "claimed" ||
    record.attemptId !== null ||
    record.cancellationRequested
  )
    throw new Error("Fresh admitted local item is required.");
  const assertQuote = () =>
    assertLocalQuote({
      quote: input.quote,
      target: input.target,
      capability: input.adapter.capability,
      providerPriceVersion: input.adapter.providerPriceVersion,
      now: input.clock(),
    });
  assertQuote();
  const prepared = await input.journal.prepare({
    attemptKey: input.key,
    request: structuredClone(input.request),
  });
  await input.adapter.assertPreparedQuote(prepared.request, input.quote);
  await input.journal.beforeDispatch(prepared.attemptId);
  const fenced = await input.store.read(input.key);
  if (
    !fenced ||
    fenced.version !== record.version + 1 ||
    fenced.status !== "unknown_acceptance" ||
    fenced.attemptId !== prepared.attemptId ||
    fenced.outcome !== null ||
    fenced.cancellationRequested
  )
    throw new Error("Joined first-dispatch projection is unavailable.");
  record = fenced;
  assertQuote(); // Synchronous last producer fence; no awaited work follows before submit.
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
  const settled = await input.store.read(input.key);
  if (!settled?.settlementRecorded) throw new Error("Canonical settlement receipt is unavailable.");
  return settled;
}
