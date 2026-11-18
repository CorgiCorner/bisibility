import { z } from "zod";

// Local conservative bound around the documented wrkspc_ alphanumeric examples.
export const modelWorkspaceIdSchema = z
  .string()
  .max(71)
  .regex(/^wrkspc_[A-Za-z0-9]{1,64}$/);
// Official provider-options available-provider slugs, reviewed 2026-11-12.
export const GATEWAY_PROVIDER_SLUGS = [
  "alibaba",
  "anthropic",
  "azure",
  "baseten",
  "bedrock",
  "bfl",
  "boundless",
  "browserbase",
  "bytedance",
  "callstack",
  "cerebras",
  "claudeaws",
  "cohere",
  "crusoe",
  "deepinfra",
  "deepseek",
  "digitalocean",
  "elevenlabs",
  "elorian",
  "exa",
  "fireworks",
  "fish-audio",
  "friendli",
  "gmicloud",
  "google",
  "groq",
  "heygen",
  "humansand",
  "inception",
  "inceptron",
  "inference-net",
  "interfaze",
  "klingai",
  "liquid",
  "meituan",
  "meta",
  "minimax",
  "mistral",
  "mixedbread",
  "modal",
  "moonshotai",
  "morph",
  "nace-ai",
  "nebius",
  "novita",
  "nvidia",
  "openai",
  "parallel",
  "parasail",
  "pareto",
  "particle",
  "perplexity",
  "poolside",
  "prodia",
  "quiverai",
  "recraft",
  "reflection",
  "relace",
  "runinfra",
  "runware",
  "sail-research",
  "sakana",
  "scaledown",
  "stealth",
  "stepfun",
  "streamlake",
  "subconscious",
  "tako",
  "telnyx",
  "tencent",
  "thinkingmachines",
  "togetherai",
  "topaz",
  "typesafe-ai",
  "vertex",
  "voyage",
  "wafer",
  "xai",
  "xiaomi",
  "zai",
] as const;
export const modelAllowedProvidersSchema = z
  .array(z.enum(GATEWAY_PROVIDER_SLUGS))
  .min(1)
  .max(16)
  .refine((value) => new Set(value).size === value.length, "Provider slugs must be unique.");
export const modelCatalogRecognitionSchema = z
  .object({
    traversal: z.literal("complete"),
    recognition: z.enum(["complete", "partial"]),
    skippedEntries: z.number().int().min(0).max(1000),
  })
  .strict()
  .refine(
    (value) => (value.recognition === "complete") === (value.skippedEntries === 0),
    "Catalog recognition must account for skipped entries.",
  );
export const modelRoutingViolationSchema = z.literal("provider_outside_allowed_set");
