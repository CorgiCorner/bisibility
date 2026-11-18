import type { AddKeywordsInput, AddKeywordsMatrixInput } from "@/lib/schemas/keyword";
import { addKeywordsMatrixSchema, addKeywordsSchema } from "@/lib/schemas/keyword";
import type { KeywordCreateChange } from "@/lib/schemas/keyword-create-review";

/** The same parsed selection drives both the drawer preview and its server write. */
export function keywordCreateChange(
  input: AddKeywordsInput | AddKeywordsMatrixInput,
): KeywordCreateChange {
  if ("devices" in input) {
    const data = addKeywordsMatrixSchema.parse(input);
    const seen = new Set<string>();
    const keywords = data.keywords.filter((text) => {
      const key = text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return {
      op: "keywords-create",
      scheduleId: data.checkScheduleId ?? null,
      cadence: data.checkScheduleId ? null : (data.schedule ?? null),
      keywords: data.locations.flatMap((selection) =>
        data.devices.flatMap((device) =>
          keywords.map((keyword) => ({
            keyword,
            device,
            ...("locationKey" in selection
              ? { locationKey: selection.locationKey }
              : { location: selection.country }),
          })),
        ),
      ),
    };
  }
  const data = addKeywordsSchema.parse(input);
  return {
    op: "keywords-create",
    scheduleId: data.checkScheduleId ?? null,
    cadence: data.checkScheduleId ? null : (data.schedule ?? null),
    keywords: (data.rows ?? (data.keywords ?? []).map((keyword) => ({ ...data, keyword }))).map(
      (row) => ({
        keyword: row.keyword,
        device: row.device,
        locationKey: row.locationKey,
        location: row.location,
        city: row.city,
      }),
    ),
  };
}
