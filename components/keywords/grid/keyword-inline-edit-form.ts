import type { LocationFieldValue } from "@/components/keywords/LocationField";
import {
  countryForLocationFieldValue,
  locationFieldValueFromKeywordLocation,
} from "@/components/keywords/location-field-value";
import type { KeywordRow } from "@/lib/queries/keywords";
import { updateKeywordSchema } from "@/lib/schemas/keyword";
import type { useTranslations } from "next-intl";
import type { FieldErrors } from "react-hook-form";
import { z } from "zod";

export const inlineEditSchema = updateKeywordSchema.extend({
  city: z.string().nullable().optional(),
  location: z.string().optional(),
});

export type InlineEditInput = z.infer<typeof inlineEditSchema>;

export const inlineEditDirty = { shouldDirty: true, shouldValidate: true } as const;

type InlineEditTranslations = ReturnType<
  typeof useTranslations<"projectRankTracker.keywordImport.management.grid">
>;

type InlineEditField = "city" | "intent" | "keyword" | "location" | "targetUrl" | "tags" | "topic";

const inlineEditErrorKeys = {
  city: "inlineValidationLocation",
  intent: "inlineValidationIntent",
  keyword: "inlineValidationKeyword",
  location: "inlineValidationLocation",
  targetUrl: "inlineValidationTargetUrl",
  tags: "inlineValidationTags",
  topic: "inlineValidationTopic",
} as const;

/**
 * Zod remains the validation authority. This maps its structured field errors
 * to the feature catalog without exposing schema prose to the client.
 */
export function inlineEditFieldError(
  field: InlineEditField,
  error: unknown,
  t: InlineEditTranslations,
) {
  return error ? t(inlineEditErrorKeys[field]) : undefined;
}

export function inlineEditTagsError(
  errors: FieldErrors<InlineEditInput>,
  t: InlineEditTranslations,
) {
  return inlineEditFieldError("tags", errors.tags, t);
}

export function initialInlineEditLocation(keyword: KeywordRow): LocationFieldValue {
  return locationFieldValueFromKeywordLocation(keyword.location, keyword.locationName);
}

export { countryForLocationFieldValue };
