import {
  modelAllowedProvidersSchema,
  modelCatalogRecognitionSchema,
  modelWorkspaceIdSchema,
} from "@/lib/providers/model/routing-settings";
import { MODEL_CONSULTED_SOURCE_LIMIT } from "@/lib/providers/model/transport-contract";
import { NATIVE_MODEL_PROVIDERS } from "@/lib/providers/model/types";
import { z } from "zod";
import { modelConnectionIdSchema, validateModelFundingInput } from "./funding-input";

export const MODEL_PLAYGROUND_LIMITS = {
  columns: 6,
  inflight: 2,
  promptCharacters: 500,
  promptBytes: 2000,
  answerBytes: 24 * 1024,
  citations: 100,
  consultedSources: MODEL_CONSULTED_SOURCE_LIMIT,
  reportBytes: 256 * 1024,
  provenanceBytes: 32 * 1024,
  documentationUrlCharacters: 2048,
  catalogBytes: 1024 * 1024,
} as const;
export const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;
export const modelProviderIdSchema = z.enum(NATIVE_MODEL_PROVIDERS);
export const modelSourceKindSchema = z.literal("raw_model");
export const modelIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/)
  .refine((value) => !/\s|\p{Cc}/u.test(value))
  .refine((value) => !value.split("/").some((part) => ["", ".", ".."].includes(part)));
export const modelSearchModeSchema = z.enum([
  "off",
  "openai_web_search",
  "anthropic_web_search_20250305",
  "openrouter_web_exa",
  "gateway_perplexity_search",
]);
const reference = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const search = z
  .object({
    mode: modelSearchModeSchema,
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    maxCalls: z.number().int().min(1).max(10).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.mode !== "off" || (value.countryCode === undefined && value.maxCalls === undefined),
    { message: "Disabled search cannot carry search settings." },
  );
export const modelColumnSettingsSchema = z
  .object({
    maxOutputTokens: z.number().int().min(16).max(4096),
    temperature: z.number().min(0).max(2).optional(),
    workspaceId: modelWorkspaceIdSchema.optional(),
    allowedProviders: modelAllowedProvidersSchema.optional(),
    search,
  })
  .strict();
export const modelColumnSchema = z
  .object({
    columnId: z.uuid(),
    providerId: modelProviderIdSchema,
    connectionId: modelConnectionIdSchema,
    sourceKind: modelSourceKindSchema,
    modelId: modelIdSchema,
    settings: modelColumnSettingsSchema,
    payment: z
      .object({ optionId: reference, fundingSource: z.enum(["byok", "platform"]) })
      .strict(),
  })
  .strict()
  .superRefine((column, ctx) => {
    validateModelFundingInput(column, ctx);
    if (column.settings.workspaceId !== undefined && column.providerId !== "anthropic")
      ctx.addIssue({
        code: "custom",
        path: ["settings", "workspaceId"],
        message: "Workspace ID is only available for Anthropic columns.",
      });
    if (column.settings.allowedProviders !== undefined && column.providerId !== "vercel_ai_gateway")
      ctx.addIssue({
        code: "custom",
        path: ["settings", "allowedProviders"],
        message: "Allowed providers are only available for gateway columns.",
      });
  });
export const modelPlaygroundDraftSchema = z
  .object({
    version: z.literal(1),
    prompt: z
      .string()
      .trim()
      .min(1)
      .refine(
        (value) => Array.from(value).length <= MODEL_PLAYGROUND_LIMITS.promptCharacters,
        "Prompt exceeds 500 characters.",
      )
      .refine(
        (value) => utf8Bytes(value) <= MODEL_PLAYGROUND_LIMITS.promptBytes,
        "Prompt exceeds 2000 UTF-8 bytes.",
      )
      .refine(
        (value) => !/[\uD800-\uDFFF]/u.test(value),
        "Prompt must contain well-formed Unicode.",
      ),
    responseLanguage: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,4})?$/),
    /** Array order is display order; columnId remains stable when reordered. */
    columns: z.array(modelColumnSchema).min(1).max(MODEL_PLAYGROUND_LIMITS.columns),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.columns.map((column) => column.columnId)).size !== value.columns.length)
      ctx.addIssue({ code: "custom", path: ["columns"], message: "Column IDs must be unique." });
    for (const providerId of modelProviderIdSchema.options) {
      const columns = value.columns.filter((column) => column.providerId === providerId);
      if (
        new Set(columns.map((column) => column.connectionId)).size > 1 ||
        new Set(columns.map((column) => column.payment.fundingSource)).size > 1
      )
        ctx.addIssue({
          code: "custom",
          path: ["columns"],
          message: "One connection and funding source per provider.",
        });
    }
  });

const capabilityEvidenceSchema = z
  .object({
    documentationUrl: z
      .url({ protocol: /^https$/ })
      .max(MODEL_PLAYGROUND_LIMITS.documentationUrlCharacters)
      .refine((value) => {
        try {
          const url = new URL(value);
          return !url.username && !url.password;
        } catch {
          return false;
        }
      }, "Documentation URLs cannot contain credentials."),
    reviewedAt: z.iso.datetime(),
    fixtureRevision: reference.nullable(),
  })
  .strict();
const protocols = {
  openai: "responses",
  anthropic: "messages",
  openrouter: "chat_completions",
  vercel_ai_gateway: "chat_completions",
} as const;
const searchModes = {
  openai: "openai_web_search",
  anthropic: "anthropic_web_search_20250305",
  openrouter: "openrouter_web_exa",
  vercel_ai_gateway: "gateway_perplexity_search",
} as const;
export const modelCatalogEntrySchema = z
  .object({
    providerId: modelProviderIdSchema,
    modelId: modelIdSchema,
    sourceKind: modelSourceKindSchema,
    protocol: z.enum(["responses", "messages", "chat_completions"]),
    capabilityVersion: reference,
    availability: z.enum(["unavailable", "fixture_verified"]),
    text: capabilityEvidenceSchema,
    maxOutputTokens: z.number().int().positive(),
    temperature: z.boolean(),
    search: z
      .array(
        z
          .object({
            mode: modelSearchModeSchema.exclude(["off"]),
            countryHint: z.boolean(),
            maxCalls: z.number().int().positive().nullable(),
            evidence: capabilityEvidenceSchema,
          })
          .strict(),
      )
      .max(1),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (entry.protocol !== protocols[entry.providerId])
      ctx.addIssue({ code: "custom", message: "Provider protocol/source mismatch." });
    if (entry.availability === "fixture_verified" && !entry.text.fixtureRevision)
      ctx.addIssue({
        code: "custom",
        message: "Runnable text requires recorded fixture evidence.",
      });
    if (entry.search.some((tool) => tool.mode !== searchModes[entry.providerId]))
      ctx.addIssue({ code: "custom", message: "Search belongs to a different provider protocol." });
  });
export const modelCatalogSnapshotSchema = z
  .object({
    version: z.literal(1),
    providerId: modelProviderIdSchema,
    accountDigest: digest,
    workspaceId: modelWorkspaceIdSchema.optional(),
    recognition: modelCatalogRecognitionSchema.optional(),
    fetchedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    capabilityVersion: reference,
    models: z.array(modelCatalogEntrySchema).max(1000),
  })
  .strict()
  .superRefine((catalog, ctx) => {
    if (catalog.workspaceId !== undefined && catalog.providerId !== "anthropic")
      ctx.addIssue({ code: "custom", message: "Workspace catalog scope belongs to Anthropic." });
    if (utf8Bytes(JSON.stringify(catalog)) > MODEL_PLAYGROUND_LIMITS.catalogBytes)
      ctx.addIssue({ code: "custom", message: "Catalog exceeds the serialized JSON byte budget." });
    const keys = catalog.models.map((entry) => `${entry.sourceKind}:${entry.modelId}`);
    if (
      new Set(keys).size !== keys.length ||
      catalog.models.some(
        (entry) =>
          entry.providerId !== catalog.providerId ||
          entry.capabilityVersion !== catalog.capabilityVersion,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Catalog identity/version mismatch or duplicate model.",
      });
    if (Date.parse(catalog.expiresAt) <= Date.parse(catalog.fetchedAt))
      ctx.addIssue({ code: "custom", message: "Catalog expiry must follow fetch time." });
  });

/** Context is supplied by the server, not by an action/API caller. No I/O occurs here. */
export function createModelPlaygroundRunSchema(
  catalogs: readonly z.infer<typeof modelCatalogSnapshotSchema>[],
  now: Date,
) {
  const snapshots = catalogs.map((catalog) => modelCatalogSnapshotSchema.parse(catalog));
  return modelPlaygroundDraftSchema.superRefine((input, ctx) => {
    input.columns.forEach((column, index) => {
      const candidates = snapshots.filter(
        (catalog) =>
          catalog.providerId === column.providerId &&
          catalog.workspaceId === column.settings.workspaceId,
      );
      const catalog = candidates.length === 1 ? candidates[0] : undefined;
      const entry = catalog?.models.find(
        (model) => model.modelId === column.modelId && model.sourceKind === column.sourceKind,
      );
      const issue = (message: string) =>
        ctx.addIssue({ code: "custom", path: ["columns", index], message });
      if (
        !catalog ||
        Date.parse(catalog.expiresAt) <= now.getTime() ||
        Date.parse(catalog.fetchedAt) > now.getTime() ||
        !entry ||
        entry.availability !== "fixture_verified"
      ) {
        issue("Model is not available in the current provider catalog.");
        return;
      }
      if (
        column.settings.maxOutputTokens > entry.maxOutputTokens ||
        (column.settings.temperature !== undefined && !entry.temperature)
      )
        issue("Settings exceed this model's documented capability.");
      if (column.settings.search.mode !== "off") {
        const tool = entry.search.find((item) => item.mode === column.settings.search.mode);
        if (
          !tool?.evidence.fixtureRevision ||
          (column.settings.search.countryCode !== undefined && !tool.countryHint) ||
          (column.settings.search.maxCalls !== undefined &&
            (tool.maxCalls === null || column.settings.search.maxCalls > tool.maxCalls))
        )
          issue("Search settings lack verified support for this route.");
      }
    });
  });
}

export const modelPlaygroundLaunchSchema = z
  .object({
    version: z.literal(1),
    requestId: z.uuid(),
    previewId: z.uuid(),
    configHash: digest,
    quoteToken: z.string().min(1).max(16384),
    byokConsent: z.literal("non_guaranteed_estimate_v1").optional(),
  })
  .strict();
