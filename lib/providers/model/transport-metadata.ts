import "server-only";
import { z } from "zod";
import { ModelTransportError } from "./errors";
import { type ModelDeadline, modelDeadline } from "./transport-deadline";
import { type CommonInput, common, MODEL_TRANSPORT_LIMITS } from "./transport-input";
import type { ModelResponseBudget, ModelTransportResponse } from "./transport-io";

export const MODEL_METADATA_LIMITS = Object.freeze({ pages: 5, models: 1000 });
export const modelMetadataIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const pageOptions = z
  .object({
    afterId: modelMetadataIdSchema.optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  })
  .strict();
const metadata = common
  .extend({ page: pageOptions.optional() })
  .strict()
  .refine(
    (input) =>
      (input.page === undefined && input.context.workspaceId === undefined) ||
      input.providerId === "anthropic",
  );
const paginated = common
  .extend({
    providerId: z.literal("anthropic"),
    page: pageOptions.omit({ afterId: true }).optional(),
  })
  .strict();
export type ModelMetadataPage = z.infer<typeof pageOptions>;
export type ModelMetadataInput =
  | (CommonInput & { page?: never })
  | (Omit<CommonInput, "providerId"> & { providerId: "anthropic"; page?: ModelMetadataPage });
export type ModelMetadataPagesInput = CommonInput & {
  providerId: "anthropic";
  page?: { limit?: number };
};
export type ModelMetadataPages = {
  completeness: "complete";
  models: Record<string, unknown>[];
  pageCount: number;
};

export function modelMetadataQuery(page?: ModelMetadataPage) {
  if (!page) return "";
  const params = new URLSearchParams();
  if (page.afterId !== undefined) params.set("after_id", page.afterId);
  if (page.limit !== undefined) params.set("limit", String(page.limit));
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export type ModelMetadataReader = (
  request: z.infer<typeof metadata>,
  deadline: ModelDeadline,
  budget?: ModelResponseBudget,
) => Promise<ModelTransportResponse>;

/** Explicit free metadata read; a raw nonterminal page is never a complete catalog. */
export async function readMetadata(
  input: ModelMetadataInput,
  readPage: ModelMetadataReader,
): Promise<ModelTransportResponse> {
  const parsed = metadata.safeParse(input);
  if (!parsed.success) throw new ModelTransportError("invalid_request");
  const request = parsed.data;
  const deadline = modelDeadline(
    request.timeoutMs ?? MODEL_TRANSPORT_LIMITS.timeoutMs,
    request.context.signal,
  );
  try {
    return await readPage(request, deadline);
  } finally {
    deadline.close();
  }
}

export const modelMetadataEnvelopeSchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())).max(MODEL_METADATA_LIMITS.models),
  has_more: z.boolean(),
  first_id: modelMetadataIdSchema.nullable(),
  last_id: modelMetadataIdSchema.nullable(),
});

/** One account, deadline and decoded-byte budget. Any incomplete traversal throws. */
export async function readMetadataPages(
  input: ModelMetadataPagesInput,
  readPage: ModelMetadataReader,
): Promise<ModelMetadataPages> {
  const parsed = paginated.safeParse(input);
  if (!parsed.success) throw new ModelTransportError("invalid_request");
  const request = parsed.data;
  const deadline = modelDeadline(
    request.timeoutMs ?? MODEL_TRANSPORT_LIMITS.timeoutMs,
    request.context.signal,
  );
  const budget = { remaining: request.maxResponseBytes ?? MODEL_TRANSPORT_LIMITS.responseBytes };
  const models: Record<string, unknown>[] = [];
  const ids = new Set<string>();
  const cursors = new Set<string>();
  let afterId: string | undefined;
  try {
    for (let pageCount = 1; pageCount <= MODEL_METADATA_LIMITS.pages; pageCount++) {
      const response = await readPage(
        { ...request, page: { afterId, limit: request.page?.limit ?? 1000 } },
        deadline,
        budget,
      );
      const parsedPage = modelMetadataEnvelopeSchema.safeParse(response.body);
      if (!parsedPage.success) throw new ModelTransportError("invalid_response");
      const page = parsedPage.data;
      for (const model of page.data) {
        const id = modelMetadataIdSchema.safeParse(model.id);
        if (!id.success || ids.has(id.data)) throw new ModelTransportError("invalid_response");
        ids.add(id.data);
        models.push(model);
      }
      if (
        models.length > MODEL_METADATA_LIMITS.models ||
        page.data.length > (request.page?.limit ?? 1000) ||
        page.first_id !== (page.data[0]?.id ?? null) ||
        page.last_id !== (page.data.at(-1)?.id ?? null)
      )
        throw new ModelTransportError("invalid_response");
      deadline.check();
      if (!page.has_more) return { completeness: "complete", models, pageCount };
      if (
        !page.last_id ||
        cursors.has(page.last_id) ||
        pageCount === MODEL_METADATA_LIMITS.pages ||
        models.length === MODEL_METADATA_LIMITS.models
      )
        throw new ModelTransportError("invalid_response");
      cursors.add(page.last_id);
      afterId = page.last_id;
    }
    throw new ModelTransportError("invalid_response");
  } finally {
    deadline.close();
  }
}
