import type { ModelCatalogSnapshot, NativeModelProviderId } from "@/lib/providers/model/types";
import { type ModelConnection, validateComposer } from "./composer-state";
import type {
  ModelPlaygroundLaunchRejection,
  ModelPlaygroundLaunchResult,
  ModelPlaygroundLaunchService,
  ModelPlaygroundQuote,
} from "./launch-service";
import { modelPlaygroundLaunchSchema } from "./schema";
import type { ModelMoney } from "./types";

/** Story/test double only. Stores quotes and launches in memory; cannot call a provider. */
export function createFakeModelPlaygroundLaunchService(options: {
  catalogs: readonly ModelCatalogSnapshot[];
  connections: readonly ModelConnection[];
  unknownProviders?: readonly NativeModelProviderId[];
  result?: ModelPlaygroundLaunchResult;
  launchRejection?: ModelPlaygroundLaunchRejection;
}): ModelPlaygroundLaunchService {
  const quotes = new Map<string, ModelPlaygroundQuote>();
  const launches = new Map<string, { previewId: string; result: ModelPlaygroundLaunchResult }>();
  return {
    async preview({ input, revision }, signal) {
      signal.throwIfAborted();
      if (validateComposer(input, options.catalogs, options.connections).length)
        throw new Error("Invalid draft");
      const fakeHash = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
      signal.throwIfAborted();
      const quote: ModelPlaygroundQuote = {
        revision,
        previewId: crypto.randomUUID(),
        quoteToken: crypto.randomUUID(),
        configHash: fakeHash,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        forecasts: input.columns.map((column) => {
          const unknown = options.unknownProviders?.includes(column.providerId);
          const money: ModelMoney = unknown
            ? {
                amount: null,
                currency: "USD",
                certainty: "unknown",
                basis: "unknown",
                rateCardVersion: null,
              }
            : {
                amount: "0.0012",
                currency: "USD",
                certainty: "estimated",
                basis: "rate_card",
                rateCardVersion: "story-fixture-v1",
              };
          return { columnId: column.columnId, money, complete: !unknown };
        }),
      };
      quotes.set(quote.previewId, structuredClone(quote));
      return quote;
    },
    async launch(request) {
      if (options.launchRejection) throw structuredClone(options.launchRejection);
      const { revision, confirmUnknown: _confirmation, ...acceptance } = request;
      modelPlaygroundLaunchSchema.parse(acceptance);
      const quote = quotes.get(request.previewId);
      if (
        !quote ||
        quote.revision !== revision ||
        quote.configHash !== request.configHash ||
        quote.quoteToken !== request.quoteToken ||
        Date.parse(quote.expiresAt) <= Date.now() ||
        request.byokConsent !== "non_guaranteed_estimate_v1"
      )
        throw new Error("Quote does not match acceptance");
      const previous = launches.get(request.requestId);
      if (previous) {
        if (previous.previewId !== request.previewId)
          throw new Error("Idempotency key belongs to another preview");
        return structuredClone(previous.result);
      }
      const result = options.result ?? { runId: crypto.randomUUID(), columns: [] };
      launches.set(request.requestId, {
        previewId: request.previewId,
        result: structuredClone(result),
      });
      return structuredClone(result);
    },
  };
}
