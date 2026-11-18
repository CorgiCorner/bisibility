import type { Prisma } from "@/lib/generated/prisma/client";
import type { ModelRunConsent } from "./admission";
import {
  issueModelConfirmation,
  modelRoot,
  modelSameAttemptSet,
  readModelConfirmation,
} from "./admission-confirmation";
import { readModelUnconfirmedAttempts } from "./admission-history";
import { refuseModelAttempt } from "./admission-refusal";
import { MODEL_ADMISSION_WINDOW_MS } from "./admission-state";
import type { ModelAttempt } from "./admission-storage";
import type { ModelPaymentQuote } from "./payment";
import { modelUsageDigest } from "./usage";

/** Match the canonical column multiset; revisions bind new admissions, not paid replays. */
export function modelColumnAttempts(
  quote: ModelPaymentQuote,
  root: ModelPaymentQuote,
  attempts: ModelAttempt[],
) {
  if (
    quote.context.namespace !== root.context.namespace ||
    quote.context.principal !== root.context.principal
  )
    return null;
  const available = [...root.context.columns];
  const mapping: Record<string, string> = {};
  const identity = (c: ModelPaymentQuote["context"]["columns"][number]) => {
    const { columnId: _id, ...selection } = c.binding.column;
    return modelUsageDigest(selection);
  };
  for (const column of quote.context.columns) {
    const index = available.findIndex((c) => identity(c) === identity(column));
    if (index < 0) return null;
    const [match] = available.splice(index, 1);
    const attempt = attempts.find((a) => a.rootColumnId === match.binding.column.columnId);
    if (!attempt) return null;
    mapping[column.binding.column.columnId] = attempt.id;
  }
  return available.length ? null : mapping;
}

export async function modelAdmittedReplay(
  tx: Prisma.TransactionClient,
  quote: ModelPaymentQuote,
  rootId: string,
  earlierAttemptUnconfirmed: boolean,
  now = new Date(),
) {
  const root = await modelRoot(tx, rootId, now);
  const columnAttempts = modelColumnAttempts(quote, root.quote, root.attempts);
  return columnAttempts
    ? {
        kind: "admitted" as const,
        quoteId: rootId,
        attempts: root.attempts,
        columnAttempts,
        replayed: true,
        earlierAttemptUnconfirmed,
      }
    : null;
}

export type ModelAdmissionPlan = {
  kind: "new_attempts";
  rootId: string;
  columns: ModelPaymentQuote["context"]["columns"];
  replacements: Record<string, ModelAttempt>;
  nonce: string | null;
};

export async function previousModelAdmission(
  tx: Prisma.TransactionClient,
  quote: ModelPaymentQuote,
  input: ModelRunConsent,
  now: Date,
) {
  // The content PK is written before reading the root, including under snapshot isolation.
  const [slot] = await tx.$queryRaw<{ root_quote_id: string }[]>`
    INSERT INTO model_playground_payment_content(project_id,actor_id,content_hash,root_quote_id,expires_at)
    VALUES(${input.projectId},${input.actorId},${quote.contentHash},${quote.quoteId},${new Date(now.getTime() + MODEL_ADMISSION_WINDOW_MS)})
    ON CONFLICT(project_id,actor_id,content_hash) DO UPDATE SET root_quote_id=model_playground_payment_content.root_quote_id
    RETURNING root_quote_id`;
  const confirmation = await readModelConfirmation(tx, quote, input);
  let rootId = slot.root_quote_id;
  if (confirmation?.consumed_root_quote_id) {
    const root = await modelRoot(tx, confirmation.consumed_root_quote_id, now);
    if (!root.live)
      return {
        kind: "not_dispatched" as const,
        reason: "confirmation_spent" as const,
        quoteInvalidated: false as const,
      };
    rootId = confirmation.consumed_root_quote_id;
  }
  if (rootId !== quote.quoteId) {
    let root = await modelRoot(tx, rootId, now);
    for (const a of root.attempts) {
      if (
        a.state === "admitted" &&
        (a.reservationState !== "reserved" ||
          !a.reservationExpiresAt ||
          a.reservationExpiresAt <= now)
      )
        await refuseModelAttempt(tx, a, "reservation_unavailable", now);
    }
    root = await modelRoot(tx, rootId, now);
    if (root.live) {
      const mapping = modelColumnAttempts(quote, root.quote, root.attempts);
      if (!mapping) throw new Error("Live model root lost its column mapping.");
      const replacements: Record<string, ModelAttempt> = {};
      for (const [column, id] of Object.entries(mapping)) {
        const a = root.attempts.find((a) => a.id === id);
        if (a?.state === "refused") replacements[column] = a;
      }
      const columns = quote.context.columns.filter((c) => replacements[c.binding.column.columnId]);
      if (columns.length)
        return {
          kind: "new_attempts",
          rootId,
          columns,
          replacements,
          nonce: null,
        } satisfies ModelAdmissionPlan;
      const unknown = await readModelUnconfirmedAttempts(tx, quote, now);
      const replay = await modelAdmittedReplay(
        tx,
        quote,
        rootId,
        unknown.earlierAttemptUnconfirmed,
        now,
      );
      await linkReplay(tx, quote.quoteId, rootId, now);
      return replay;
    }
  }
  const unknown = await readModelUnconfirmedAttempts(tx, quote, now);
  if (
    unknown.attemptIds.length &&
    (!confirmation || !modelSameAttemptSet(confirmation.attempt_ids, unknown.attemptIds))
  )
    return issueModelConfirmation(tx, quote, unknown.attemptIds, now);
  return {
    kind: "new_attempts",
    rootId: quote.quoteId,
    columns: quote.context.columns,
    replacements: {},
    nonce: unknown.attemptIds.length ? (confirmation?.nonce ?? null) : null,
  } satisfies ModelAdmissionPlan;
}

export async function linkReplay(
  tx: Prisma.TransactionClient,
  quoteId: string,
  root: string,
  now: Date,
) {
  await tx.$executeRaw`UPDATE model_playground_payment_quotes SET accepted_at=${now},replay_of=${root} WHERE id=${quoteId}`;
}
