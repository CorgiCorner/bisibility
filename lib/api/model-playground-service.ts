import "server-only";
import type { Actor } from "@/lib/auth/authorize";
import type { ModelAdmissionResult, ModelRunConsent } from "@/lib/model-playground/admission";
import type { ModelAttemptState } from "@/lib/model-playground/admission-state";
import type { ModelAttempt } from "@/lib/model-playground/admission-storage";
import type { ModelPlaygroundCatalogRequest } from "@/lib/model-playground/catalog-request";
import type { ModelPlaygroundQuote } from "@/lib/model-playground/launch-service";
import type { ModelAdmissionReason } from "@/lib/model-playground/payment";
import type { ModelPlaygroundInput } from "@/lib/model-playground/types";
import type { ProviderCredential } from "@/lib/provider-usage/surface";
import type { ProviderRequestSource } from "@/lib/provider-usage/tag";
import type { z } from "zod";
import type {
  modelPlaygroundAdmissionReasonSchema,
  modelPlaygroundAdmissionSchema,
  modelPlaygroundAttemptStateSchema,
  modelPlaygroundCatalogSchema,
  modelPlaygroundCreateSchema,
  modelPlaygroundEstimateSchema,
  modelPlaygroundPreviewSchema,
  modelPlaygroundRunSchema,
} from "./model-playground-schemas";
import { serverModelPlaygroundService } from "./model-playground-server-service";

export type ModelPlaygroundScope = {
  actor: Actor;
  projectId: string;
  projectPublicId: string;
  entrySource: ProviderRequestSource;
  credential: ProviderCredential;
};
export type ModelPlaygroundServiceFailure = {
  kind: "not_available_yet" | "not_found" | "forbidden" | "validation_failed";
};
export type ModelPlaygroundCreateInput = Pick<
  ModelRunConsent,
  "quoteId" | "consent" | "confirmUnknown"
> & { version: 1 };
export type ModelPlaygroundAdmission =
  | Extract<ModelAdmissionResult, { kind: "confirmation_required" }>
  | (Omit<Extract<ModelAdmissionResult, { kind: "not_dispatched" }>, "quoteInvalidated"> & {
      quoteInvalidated: true;
    })
  | (Omit<
      Extract<ModelAdmissionResult, { kind: "admitted" }>,
      "attempts" | "replacementRefusal"
    > & {
      replacementRefusal?: { reason: ModelAdmissionReason; quoteInvalidated: true };
      runId: string;
      attempts: Pick<ModelAttempt, "id" | "columnId" | "state">[];
    });
export type ModelPlaygroundCatalog = z.infer<typeof modelPlaygroundCatalogSchema>;
export type ModelPlaygroundRun = z.infer<typeof modelPlaygroundRunSchema>;
export type ModelPlaygroundEstimate = z.infer<typeof modelPlaygroundEstimateSchema>;
type QuoteMoney = ModelPlaygroundQuote["forecasts"][number]["money"];
type ForecastMoney = Omit<QuoteMoney, "amount" | "certainty" | "basis" | "rateCardVersion"> &
  (
    | { amount: string; certainty: "estimated"; basis: "rate_card"; rateCardVersion: string }
    | { amount: null; certainty: "unknown"; basis: "unknown"; rateCardVersion: null }
  );
export type ModelPlaygroundPreview = Pick<ModelPlaygroundQuote, "expiresAt"> & {
  version: 1;
  quoteId: string;
  forecasts: (Omit<ModelPlaygroundQuote["forecasts"][number], "money"> & {
    money: ForecastMoney;
  })[];
};
// Normalize intersections before checking strict type equality (including future extra fields).
type Shape<T> = T extends object ? { [K in keyof T]: Shape<T[K]> } : T;
type Equal<A, B> =
  (<T>() => T extends Shape<A> ? 1 : 2) extends <T>() => T extends Shape<B> ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type ModelPlaygroundContractChecks = [
  Assert<Equal<ModelPlaygroundAdmission, z.infer<typeof modelPlaygroundAdmissionSchema>>>,
  Assert<Equal<ModelPlaygroundPreview, z.infer<typeof modelPlaygroundPreviewSchema>>>,
  Assert<Equal<ModelPlaygroundCreateInput, z.infer<typeof modelPlaygroundCreateSchema>>>,
  Assert<Equal<ModelAttemptState, z.infer<typeof modelPlaygroundAttemptStateSchema>>>,
  Assert<Equal<ModelAdmissionReason, z.infer<typeof modelPlaygroundAdmissionReasonSchema>>>,
];
type Outcome<T> = Promise<T | ModelPlaygroundServiceFailure>;

/** Failure results are legal only before side effects; uncertain failures must throw.
 * All members recheck live project access. No secrets, endpoints or client prices cross this port. */
export interface ModelPlaygroundService {
  /** Server-only activation gate, false until the native runtime is wired and enabled. */
  readonly enabled: boolean;
  /** Verify project, native provider, own credential source and connection readiness without decrypting a key. */
  checkConnection(
    scope: ModelPlaygroundScope,
    input: ModelPlaygroundCatalogRequest,
  ): Outcome<{ kind: "ready" }>;
  /** Free metadata load; honor workspace and credential-revision cache scope. */
  catalog(
    scope: ModelPlaygroundScope,
    input: ModelPlaygroundCatalogRequest,
  ): Outcome<ModelPlaygroundCatalog>;
  /** Read-scope, non-binding estimate. Writes nothing, never calls the provider (a catalog cache
   * miss is unknown cost) and returns no quote, preview, expiry or budget state. */
  estimate(
    scope: ModelPlaygroundScope,
    input: ModelPlaygroundInput,
  ): Outcome<ModelPlaygroundEstimate>;
  /** Persist a server-owned quote before returning its opaque ID. Never dispatch. */
  preview(
    scope: ModelPlaygroundScope,
    input: ModelPlaygroundInput,
  ): Outcome<ModelPlaygroundPreview>;
  /** Bind each key to its quote/body; admit durably before queueing. Thrown failures are uncertain.
   * Explicit recovery uses a NEW key and identical body, including the same confirmUnknown.
   * Outcomes: saved admission (runId, replayed=true), fresh admission (replayed=false),
   * confirmation_required, or not_dispatched. A committed confirmation must replay its saved
   * admission, not confirmation_spent merely because its nonce was consumed.
   * HTTP failures can stay cached under the original key. */
  create(
    scope: ModelPlaygroundScope,
    input: ModelPlaygroundCreateInput,
    idempotencyKey: string,
  ): Outcome<ModelPlaygroundAdmission>;
  /** Read persisted columns only, scoped to project. Never dispatch or retry a model. */
  read(scope: ModelPlaygroundScope, runId: string): Outcome<ModelPlaygroundRun>;
}

const unavailable = async (): Promise<ModelPlaygroundServiceFailure> => ({
  kind: "not_available_yet",
});
export const defaultModelPlaygroundService: ModelPlaygroundService = Object.freeze({
  enabled: false,
  checkConnection: unavailable,
  catalog: unavailable,
  estimate: unavailable,
  preview: unavailable,
  create: unavailable,
  read: unavailable,
});

/** The native server runtime owns activation for both entry points. */
export function getModelPlaygroundService(): ModelPlaygroundService {
  return serverModelPlaygroundService;
}
