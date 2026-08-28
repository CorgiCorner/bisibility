import { z } from "zod";

export const CANONICAL_KEY_MAX = 260;

export const locationSearchItemSchema = z
  .object({
    canonical_key: z.string().trim().min(1).max(CANONICAL_KEY_MAX),
    city_name: z.string().trim().min(1).max(180).nullable(),
    country_code: z.string().trim().length(2),
    display_name: z.string().trim().min(1).max(240),
    hl: z.string().trim().min(2).max(35).optional(),
    id: z
      .string()
      .trim()
      .min(1)
      .max("location:".length + CANONICAL_KEY_MAX)
      .optional(),
    kind: z.enum(["country", "region", "city"]),
    language_code: z.string().trim().min(2).max(35).optional(),
    language_label: z.string().trim().min(1).max(120).optional(),
    region_code: z.string().trim().min(1).max(120).nullable().optional(),
    region_name: z.string().trim().min(1).max(180).nullable(),
  })
  .strict();

export const locationSearchResponseSchema = z
  .object({ data: z.array(locationSearchItemSchema) })
  .passthrough();

export const locationSearchConsumerResponseSchema = z
  .object({ data: z.array(locationSearchItemSchema.passthrough()) })
  .passthrough();

export type LocationSearchItem = z.infer<typeof locationSearchItemSchema>;

export type NormalizedLocationSearchItem = LocationSearchItem & { id: string };

export function normalizeLocationSearchItem(
  item: LocationSearchItem,
): NormalizedLocationSearchItem {
  return { ...item, id: item.id ?? item.canonical_key };
}
