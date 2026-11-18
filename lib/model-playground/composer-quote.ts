import type {
  ModelPlaygroundConfirmationRequired,
  ModelPlaygroundLaunchResult,
  ModelPlaygroundQuote,
} from "./launch-service";
import { type ModelPlaygroundInput, modelMoneySchema } from "./types";

export function isCompleteQuote(quote: ModelPlaygroundQuote, input: ModelPlaygroundInput) {
  return (
    quote.forecasts.length === input.columns.length &&
    new Set(quote.forecasts.map((item) => item.columnId)).size === input.columns.length &&
    input.columns.every((column) =>
      quote.forecasts.some(
        (item) =>
          item.columnId === column.columnId && modelMoneySchema.safeParse(item.money).success,
      ),
    )
  );
}
export function sumForecasts(items: ModelPlaygroundQuote["forecasts"]): string | null {
  if (
    !items.length ||
    items.some(
      (item) =>
        !item.complete || item.money.certainty !== "estimated" || item.money.amount === null,
    ) ||
    new Set(items.map((item) => item.money.currency)).size !== 1
  )
    return null;
  const amounts = items.map((item) => item.money.amount ?? "0");
  const scale = Math.max(...amounts.map((amount) => amount.split(".")[1]?.length ?? 0));
  const total = amounts
    .reduce((sum, amount) => {
      const [integer, fraction = ""] = amount.split(".");
      return sum + BigInt(integer + fraction.padEnd(scale, "0"));
    }, 0n)
    .toString()
    .padStart(scale + 1, "0");
  return scale ? `${total.slice(0, -scale)}.${total.slice(-scale)}` : total;
}

export type PendingModelConfirmation = {
  contentKey: string;
  value: ModelPlaygroundConfirmationRequired;
};
export function pendingModelRead(
  runId: string,
  input: ModelPlaygroundInput,
): ModelPlaygroundLaunchResult {
  return {
    runId,
    columns: [],
    progress: input.columns.map((c) => ({ columnId: c.columnId, state: "admitted" })),
  };
}

export function modelConfirmationInput(
  pending: PendingModelConfirmation | null,
  contentKey: string,
  confirmed: boolean,
) {
  if (!confirmed || pending?.contentKey !== contentKey) return undefined;
  const { nonce, contentHash, attemptIds } = pending.value;
  return { nonce, contentHash, attemptIds };
}

export function currentModelQuote(
  quote: ModelPlaygroundQuote | null,
  revision: string,
  input: ModelPlaygroundInput,
) {
  return quote?.revision === revision &&
    Date.parse(quote.expiresAt) > Date.now() &&
    isCompleteQuote(quote, input)
    ? quote
    : null;
}
