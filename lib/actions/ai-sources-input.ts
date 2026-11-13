import {
  registrableSourceDomain,
  type SourceOverrideType,
  sourceOverrideTypes,
} from "@/lib/ai-tracking/source-types";
import { AI_SOURCE_PLAN_STATES } from "@/lib/ai-tracking/sources-model";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { z } from "zod";

export const AI_SOURCE_NOTE_MAX = 280;
export const AI_SOURCE_URL_MAX = 2000;

const projectId = z
  .string()
  .trim()
  .refine((value) => isPublicIdOfType(value, "prj"), "Use a prj_ reference.");

const domain = z
  .string()
  .trim()
  .transform((value, context) => {
    const registrable = registrableSourceDomain(value);
    if (!registrable) {
      context.addIssue({ code: "custom", message: "Use a public domain." });
      return z.NEVER;
    }
    return registrable;
  });

const sourceType = z.enum(sourceOverrideTypes);

const note = z
  .string()
  .trim()
  .max(AI_SOURCE_NOTE_MAX)
  .nullable()
  .optional()
  .transform((value) => value || null);

export const setAiSourceTypeSchema = z.object({
  domain,
  projectId,
  type: sourceType,
});

export const clearAiSourceTypeSchema = z.object({
  domain,
  projectId,
});

export const addAiSourcePlanSchema = z.object({
  domain,
  projectId,
  url: z.string().trim().max(AI_SOURCE_URL_MAX).nullable().optional(),
});

export const updateAiSourcePlanSchema = z.object({
  domain,
  note,
  projectId,
  state: z.enum(AI_SOURCE_PLAN_STATES).optional(),
});

export const removeAiSourcePlanSchema = z.object({
  domain,
  projectId,
});

export type AiSourceActionError = "fixed" | "missing" | "url";
export type AiSourceActionResult = { ok: true } | { ok: false; error: AiSourceActionError };

export function sourcePageUrl(
  url: string | null | undefined,
  sourceDomain: string,
): { url: string | null } | { error: "url" } {
  if (!url) return { url: null as string | null };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: "url" as const };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { error: "url" as const };
  if (registrableSourceDomain(parsed.hostname) !== sourceDomain) return { error: "url" as const };
  return { url };
}

export function isSourceOverrideType(value: string): value is SourceOverrideType {
  return sourceOverrideTypes.some((type) => type === value);
}
