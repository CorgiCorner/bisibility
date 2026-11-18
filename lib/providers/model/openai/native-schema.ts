import { z } from "zod";

const id = z.string().min(1).max(256);
export const nativeCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text = z.string().refine((value) => !/[\uD800-\uDFFF]/u.test(value));
const annotation = z
  .object({
    type: z.literal("url_citation"),
    start_index: nativeCount,
    end_index: nativeCount,
    url: z.string().max(2048),
    title: z.string(),
  })
  .strict();
const content = z.discriminatedUnion("type", [
  z.object({ type: z.literal("output_text"), text, annotations: z.array(annotation) }),
  z.object({ type: z.literal("refusal"), refusal: z.string() }),
]);
const action = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("search"),
    query: z.string().optional(),
    queries: z.array(z.string()).optional(),
    sources: z.array(z.unknown()).optional(),
  }),
  z.object({ type: z.literal("open_page"), url: z.string().nullable().optional() }),
  z.object({
    type: z.literal("find_in_page"),
    pattern: z.string(),
    url: z.string().nullable().optional(),
  }),
]);
export const nativeSearchCallSchema = z.object({
  type: z.literal("web_search_call"),
  id,
  status: z.enum(["completed", "failed", "incomplete", "in_progress", "searching"]),
  action: action.optional(),
});
const output = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    id,
    role: z.literal("assistant"),
    status: z.enum(["completed", "in_progress", "incomplete"]),
    content: z.array(content),
  }),
  nativeSearchCallSchema,
  z.object({
    type: z.literal("reasoning"),
    id,
    status: z.enum(["completed", "in_progress", "incomplete"]).optional(),
  }),
]);

export const nativeEnvelopeSchema = z.object({
  object: z.literal("response"),
  model: z.string(),
  status: z.enum(["completed", "failed", "incomplete", "in_progress", "queued", "cancelled"]),
  output: z.array(z.unknown()),
  usage: z.unknown().optional(),
  tool_usage: z.unknown().optional(),
});
export const nativeResponseSchema = nativeEnvelopeSchema.extend({
  output: z.array(output),
  error: z.object({ code: z.string() }).nullable(),
  incomplete_details: z
    .object({
      reason: z.enum(["max_output_tokens", "max_messages", "content_filter", "steered"]).optional(),
    })
    .nullable(),
});
export type NativeEnvelope = z.infer<typeof nativeEnvelopeSchema>;
export type NativeResponse = z.infer<typeof nativeResponseSchema>;
export type NativeText = Extract<z.infer<typeof content>, { type: "output_text" }>;
