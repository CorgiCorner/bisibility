import { z } from "zod";

export const BRAND_NAME_OVERLAP_MESSAGE = "A name cannot be both an alias and an excluded name.";
export const BRAND_NAME_IDENTITY_MESSAGE = "The brand label and domain cannot be excluded.";

function uniqueNames(message: string) {
  return (names: string[], context: z.RefinementCtx) => {
    const seen = new Set<string>();
    for (const [index, name] of names.entries()) {
      const key = name.toLowerCase();
      if (seen.has(key)) {
        context.addIssue({ code: "custom", message, path: [index] });
      }
      seen.add(key);
    }
  };
}

/** Same bounds as competitor aliases: 1..120 characters, at most 50, case-insensitive unique. */
export function brandNameListSchema(emptyMessage: string, uniqueMessage: string) {
  return z
    .array(z.string().trim().min(1, emptyMessage).max(120))
    .max(50)
    .superRefine(uniqueNames(uniqueMessage));
}

export const aliasesSchema = brandNameListSchema(
  "Aliases cannot be empty.",
  "Aliases must be unique.",
);
export const excludedNamesSchema = brandNameListSchema(
  "Excluded names cannot be empty.",
  "Excluded names must be unique.",
);

function rejectBrandNameOverlap(
  value: { aliases: readonly string[]; excludedNames: readonly string[] },
  context: z.RefinementCtx,
) {
  const aliasKeys = new Set(value.aliases.map((alias) => alias.toLowerCase()));
  value.excludedNames.forEach((name, index) => {
    if (aliasKeys.has(name.toLowerCase())) {
      context.addIssue({
        code: "custom",
        message: BRAND_NAME_OVERLAP_MESSAGE,
        path: ["excludedNames", index],
      });
    }
  });
}

export const brandNameFields = {
  aliases: aliasesSchema,
  excludedNames: excludedNamesSchema,
};

export const brandNameDraftSchema = z.object(brandNameFields).superRefine(rejectBrandNameOverlap);

export type BrandNameDraft = z.infer<typeof brandNameDraftSchema>;

export function brandNameIdentityConflict(
  excludedNames: readonly string[],
  identity: { domain?: string | null; label?: string | null },
) {
  const fixed = new Set(
    [identity.label, identity.domain]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.toLowerCase()),
  );
  return excludedNames.some((name) => fixed.has(name.toLowerCase()))
    ? BRAND_NAME_IDENTITY_MESSAGE
    : null;
}
