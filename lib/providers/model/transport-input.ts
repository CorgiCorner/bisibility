import { modelColumnSchema } from "@/lib/model-playground/schema";
import { z } from "zod";
import { ModelTransportError } from "./errors";
import { modelWorkspaceIdSchema } from "./routing-settings";
import type { ModelNormalizedResponse } from "./transport-evidence";
import { type ModelTransportResponse, safeModelJson } from "./transport-io";
import { type ModelJsonOptions, modelJsonOptionsSchema } from "./transport-json";
import {
  type ModelProviderContext,
  type ModelUsageObserver,
  NATIVE_MODEL_PROVIDERS,
  type NativeModelProviderId,
} from "./types";
export const MODEL_TRANSPORT_LIMITS = Object.freeze({
  timeoutMs: 120_000,
  responseBytes: 1024 * 1024,
  requestBytes: 64 * 1024,
} as const);

export const common = z
  .object({
    providerId: z.enum(NATIVE_MODEL_PROVIDERS),
    context: z
      .object({
        apiKey: z
          .string()
          .min(1)
          .max(8192)
          .regex(/^[\x21-\x7e]+$/),
        workspaceId: modelWorkspaceIdSchema.optional(),
        accountDigest: z.string().regex(/^[a-f0-9]{64}$/),
        signal: z.custom<AbortSignal>((value) => value instanceof AbortSignal),
      })
      .strict(),
    timeoutMs: z.number().int().min(1).max(MODEL_TRANSPORT_LIMITS.timeoutMs).optional(),
    jsonOptions: modelJsonOptionsSchema.optional(),
    maxResponseBytes: z.number().int().min(1).max(MODEL_TRANSPORT_LIMITS.responseBytes).optional(),
  })
  .strict();

export type CommonInput = {
  providerId: NativeModelProviderId;
  context: ModelProviderContext;
  timeoutMs?: number;
  jsonOptions?: ModelJsonOptions;
  maxResponseBytes?: number;
};

export const generation = common
  .extend({
    column: modelColumnSchema,
    operationKey: z
      .string()
      .min(1)
      .max(256)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
    body: z.unknown(),
    observer: z.custom<ModelUsageObserver>(
      (value) =>
        !!value &&
        typeof (value as ModelUsageObserver).beforeDispatch === "function" &&
        typeof (value as ModelUsageObserver).settle === "function",
    ),
    normalize: z.custom<(response: ModelTransportResponse) => ModelNormalizedResponse>(
      (value) => typeof value === "function",
    ),
  })
  .strict()
  .refine(
    (input) =>
      input.context.workspaceId === undefined ||
      (input.providerId === "anthropic" &&
        input.context.workspaceId === input.column.settings.workspaceId),
  );

export type ModelGenerationInput = CommonInput & {
  column: z.infer<typeof modelColumnSchema>;
  operationKey: string;
  body: Record<string, unknown>;
  observer: ModelUsageObserver;
  normalize(response: ModelTransportResponse): ModelNormalizedResponse;
};

export function encodeBody(input: z.infer<typeof generation>) {
  try {
    const text = JSON.stringify(input.body);
    if (text === undefined || Buffer.byteLength(text) > MODEL_TRANSPORT_LIMITS.requestBytes)
      throw new Error();
    const body = safeModelJson(text);
    if (body.model !== input.column.modelId || (body.stream !== undefined && body.stream !== false))
      throw new Error();
    return text;
  } catch {
    throw new ModelTransportError("invalid_request");
  }
}
