import { addManagedCompetitorSchema } from "@/lib/competitors/types";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { z } from "zod";

const referenceSchema = <Prefix extends "cmp" | "pmkt" | "prj">(prefix: Prefix) =>
  z
    .string()
    .trim()
    .refine((value) => isPublicIdOfType(value, prefix), `Use a ${prefix}_ reference.`);

const aliasSchema = z.string().trim().min(1, "Aliases cannot be empty.").max(120);

const aliasesSchema = z
  .array(aliasSchema)
  .max(50)
  .superRefine((aliases, context) => {
    const seen = new Set<string>();
    for (const [index, alias] of aliases.entries()) {
      const key = alias.toLowerCase();
      if (seen.has(key)) {
        context.addIssue({ code: "custom", message: "Aliases must be unique.", path: [index] });
      }
      seen.add(key);
    }
  });

const existingDomainSchema = addManagedCompetitorSchema.pick({ domain: true, projectId: true });

const normalizedSuggestionDomainSchema = z
  .string()
  .trim()
  .superRefine((domain, context) => {
    const parsed = existingDomainSchema.safeParse({
      domain,
      projectId: "prj_abcdefghijklmnopqrstuvwx",
    });
    if (!parsed.success || parsed.data.domain !== domain) {
      context.addIssue({ code: "custom", message: "Use a normalized bare domain." });
    }
  });

const projectIdSchema = referenceSchema("prj");

export const confirmSuggestedCompetitorSchema = z.object({
  domain: normalizedSuggestionDomainSchema,
  projectId: projectIdSchema,
});

export const dismissCompetitorSuggestionSchema = confirmSuggestedCompetitorSchema;

export const addManualCompetitorSchema = addManagedCompetitorSchema
  .pick({ domain: true, label: true })
  .extend({ aliases: aliasesSchema, projectId: projectIdSchema });

export const updateCompetitorAliasesSchema = z.object({
  aliases: aliasesSchema,
  competitorId: referenceSchema("cmp"),
  projectId: projectIdSchema,
});

export const replaceCompetitorMarketsSchema = z.object({
  competitorId: referenceSchema("cmp"),
  marketIds: z.array(referenceSchema("pmkt")).superRefine((marketIds, context) => {
    if (new Set(marketIds).size !== marketIds.length) {
      context.addIssue({ code: "custom", message: "Markets must be unique." });
    }
  }),
  projectId: projectIdSchema,
  scopePolicy: z.enum(["all_markets", "selected_markets"]),
});

export const skipCompetitorSetupSchema = z.object({ projectId: projectIdSchema });

export const competitorDetailsSchema = addManualCompetitorSchema.pick({
  aliases: true,
  domain: true,
});
export const competitorDetailsFormSchema = competitorDetailsSchema.extend({
  aliases: z.string().transform((value, context) => {
    const aliases = value
      .split(",")
      .map((alias) => alias.trim())
      .filter(Boolean);
    const parsed = aliasesSchema.safeParse(aliases);
    if (!parsed.success) {
      context.addIssue({ code: "custom", message: parsed.error.issues[0].message });
      return z.NEVER;
    }
    return parsed.data;
  }),
});
export const updateCompetitorDetailsSchema = competitorDetailsSchema.extend({
  competitorId: referenceSchema("cmp"),
  projectId: projectIdSchema,
});
export type CompetitorDetails = z.output<typeof competitorDetailsSchema>;
export type UpdateCompetitorDetailsInput = z.input<typeof updateCompetitorDetailsSchema>;
