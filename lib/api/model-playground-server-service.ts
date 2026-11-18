import "server-only";
import { ProjectNotFoundError } from "@/lib/actions/_shared";
import { AuthorizationError } from "@/lib/auth/authorize";
import { readModelAttempts, readModelPaymentQuote } from "@/lib/model-playground/admission-storage";
import { checkModelConnection } from "@/lib/model-playground/connection-resolution";
import { estimateModelPlayground } from "@/lib/model-playground/estimate";
import { launchModelPlayground } from "@/lib/model-playground/launch";
import { ModelAdmissionRefusal } from "@/lib/model-playground/payment";
import { previewModelPlayground } from "@/lib/model-playground/preview";
import { readModelPlayground } from "@/lib/model-playground/read";
import type { ModelPlaygroundRuntime } from "@/lib/model-playground/runtime-contract";
import { nativeComposer } from "@/lib/model-playground/server";
import { createModelPlaygroundStore } from "@/lib/model-playground/store";
import { ModelTransportError } from "@/lib/providers/model/errors";
import { z } from "zod";
import { apiModelPlaygroundRuntime } from "./model-playground-runtime";
import {
  modelPlaygroundCreateSchema,
  modelPlaygroundEstimateSchema,
  modelPlaygroundPreviewSchema,
  modelPlaygroundRunSchema,
  projectModelPlaygroundRun,
  withDemotedRead,
} from "./model-playground-schemas";
import type {
  ModelPlaygroundAdmission,
  ModelPlaygroundRun,
  ModelPlaygroundScope,
  ModelPlaygroundService,
  ModelPlaygroundServiceFailure,
} from "./model-playground-service";

function refusal(error: unknown): ModelPlaygroundServiceFailure {
  if (error instanceof ProjectNotFoundError) return { kind: "not_found" };
  if (error instanceof AuthorizationError) return { kind: "forbidden" };
  if (error instanceof ModelAdmissionRefusal)
    return { kind: error.reason === "access_denied" ? "forbidden" : "validation_failed" };
  // Input is parsed at the boundary; Zod failures here concern server-owned data.
  if (error instanceof z.ZodError)
    throw new Error("Model Playground server data failed validation.");
  if (
    error instanceof ModelTransportError &&
    !error.dispatched &&
    ["invalid_request", "invalid_credentials", "refused"].includes(error.code)
  )
    return { kind: "validation_failed" };
  throw error;
}

async function run<T>(
  scope: ModelPlaygroundScope,
  action: "read" | "create",
  work: (runtime: ModelPlaygroundRuntime) => Promise<T>,
): Promise<T | ModelPlaygroundServiceFailure> {
  const runtime = apiModelPlaygroundRuntime(scope);
  try {
    await runtime.authorize(action);
  } catch (error) {
    return refusal(error);
  }
  // The REST service follows the nativeComposer.enabled server rollout condition.
  if (!nativeComposer.enabled) return { kind: "not_available_yet" };
  return work(runtime);
}

export const serverModelPlaygroundService: ModelPlaygroundService = {
  get enabled() {
    return nativeComposer.enabled;
  },
  checkConnection: (scope, input) =>
    run(scope, "read", async (runtime) => {
      try {
        await checkModelConnection(runtime.db, scope.projectId, input);
        return { kind: "ready" as const };
      } catch (error) {
        return refusal(error);
      }
    }),
  catalog: (scope, input) =>
    run(scope, "read", async (runtime) => {
      try {
        const { catalog } = await runtime.resolve(runtime.db, scope.projectId, input);
        const { accountDigest: _private, ...publicCatalog } = catalog;
        return publicCatalog;
      } catch (error) {
        return refusal(error);
      }
    }),
  estimate: (scope, input) =>
    run(scope, "read", async (runtime) => {
      let estimate: Awaited<ReturnType<typeof estimateModelPlayground>>;
      try {
        estimate = await estimateModelPlayground(runtime, input);
      } catch (error) {
        if (
          error instanceof ModelAdmissionRefusal ||
          error instanceof ModelTransportError ||
          error instanceof z.ZodError
        )
          return refusal(error);
        throw error;
      }
      // Explicit projection: nothing binding can leak into the read response.
      const projected = modelPlaygroundEstimateSchema.safeParse({
        version: 1,
        estimatedAt: estimate.estimatedAt,
        budgetAvailable: estimate.budgetAvailable,
        forecasts: estimate.forecasts.map(({ columnId, money, complete }) => ({
          columnId,
          money,
          complete,
        })),
      });
      if (!projected.success)
        throw new Error("Model Playground estimate response failed validation.");
      return projected.data;
    }),
  preview: (scope, input) =>
    run(scope, "create", async (runtime) => {
      let quote: Awaited<ReturnType<typeof previewModelPlayground>>;
      try {
        quote = await previewModelPlayground(runtime, { revision: "rest-v1", input });
      } catch (error) {
        // Typed runtime refusals precede dispatch; unexpected transaction outcomes throw.
        if (
          error instanceof ModelAdmissionRefusal ||
          error instanceof ModelTransportError ||
          error instanceof z.ZodError
        )
          return refusal(error);
        throw error;
      }
      const projected = modelPlaygroundPreviewSchema.safeParse({
        version: 1,
        quoteId: quote.previewId,
        expiresAt: quote.expiresAt,
        forecasts: quote.forecasts,
      });
      if (!projected.success)
        throw new Error("Model Playground preview response failed validation.");
      return projected.data;
    }),
  create: (scope, input, idempotencyKey) =>
    run(scope, "create", async (runtime) => {
      const parsed = modelPlaygroundCreateSchema.safeParse(input);
      if (
        !parsed.success ||
        (input.confirmUnknown?.attemptIds.length ?? 0) > 100 ||
        !idempotencyKey.trim() ||
        idempotencyKey.length > 200
      )
        return { kind: "validation_failed" as const };
      const retained = await runtime.db.$transaction((tx) =>
        readModelPaymentQuote(tx, input.quoteId),
      );
      if (
        !retained ||
        retained.quote.context.projectId !== scope.projectId ||
        retained.quote.context.actorId !== scope.actor.id
      )
        return { kind: "not_found" as const };
      // HTTP owns body-bound key replay. Domain admission owns quote replay across keys,
      // timeouts and crashes: one consent can never purchase a second set of attempts.
      const outcome = await launchModelPlayground(
        runtime,
        {
          version: 1,
          revision: "rest-v1",
          requestId: input.quoteId,
          previewId: input.quoteId,
          quoteToken: input.quoteId,
          configHash: retained.quote.configHash,
          byokConsent: input.consent,
          ...(input.confirmUnknown ? { confirmUnknown: input.confirmUnknown } : {}),
        },
        undefined,
        true,
      );
      switch (outcome.kind) {
        case "admitted":
          if (!outcome.admission) throw new Error("Missing saved Model Playground admission.");
          // Replacement rollback rejects an unaccepted quote before returning the saved root.
          if (outcome.admission.replacementRefusal?.quoteInvalidated === false)
            throw new Error("Missing committed Model Playground replacement rejection.");
          return {
            kind: "admitted",
            quoteId: outcome.admission.quoteId,
            columnAttempts: outcome.admission.columnAttempts,
            replayed: outcome.admission.replayed,
            earlierAttemptUnconfirmed: outcome.admission.earlierAttemptUnconfirmed,
            ...(outcome.admission.replacementRefusal
              ? {
                  replacementRefusal: {
                    reason: outcome.admission.replacementRefusal.reason,
                    quoteInvalidated: true as const,
                  },
                }
              : {}),
            runId: outcome.result.runId,
            attempts: outcome.admission.attempts.map(({ id, columnId, state }) => ({
              id,
              columnId,
              state,
            })),
          } satisfies ModelPlaygroundAdmission;
        case "confirmation_required":
          return outcome;
        case "invalid_request":
          return { kind: outcome.reason };
        case "not_dispatched":
          if (!outcome.quoteInvalidated) {
            if (outcome.reason === "quote_missing" || outcome.reason === "access_denied")
              return { kind: "not_found" as const };
            throw new Error("Missing committed Model Playground quote rejection.");
          }
          return {
            kind: "not_dispatched" as const,
            reason: outcome.reason,
            quoteInvalidated: true as const,
          };
        case "access_denied":
          return { kind: "forbidden" as const };
        case "feature_disabled":
        case "run_not_created":
        case "uncertain":
          throw new Error("Model Playground admission outcome is uncertain.");
      }
    }),
  read: (scope, runId) =>
    run(
      scope,
      "read",
      async (runtime): Promise<ModelPlaygroundRun | ModelPlaygroundServiceFailure> => {
        const result = await readModelPlayground(runtime, runId);
        if (!result || result.runId !== runId) return { kind: "not_found" };
        const stored = await createModelPlaygroundStore(runtime.db).read(
          scope.projectId,
          result.runId,
        );
        const attempts = await runtime.db.$transaction((tx) =>
          readModelAttempts(tx, stored.previewId),
        );
        const projected = projectModelPlaygroundRun({
          version: 1,
          runId: result.runId,
          projectId: scope.projectPublicId,
          reportId: result.reportId ?? null,
          prompt: stored.snapshot.input.prompt,
          responseLanguage: stored.snapshot.input.responseLanguage,
          columns: stored.columns.map((column) => {
            const attempt = attempts.find((a) => a.rootColumnId === column.columnId);
            return {
              column: column.config,
              state: column.state,
              attemptId: attempt?.id ?? null,
              attemptState: attempt?.state ?? null,
              result: result.columns.find((c) => c.column.columnId === column.columnId) ?? null,
              resultIssue: null,
            };
          }),
        });
        return withDemotedRead(() => {
          const parsed = modelPlaygroundRunSchema.safeParse(projected);
          if (!parsed.success) throw new Error("Model Playground run response failed validation.");
          return parsed.data;
        });
      },
    ),
};
