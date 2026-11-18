import type { ModelCatalogSnapshot } from "@/lib/providers/model/types";
import { catalogEntry } from "./composer-state";
import { modelColumnSchema } from "./schema";

/** Keep catalog-specific bounds on the same field paths as the shared schema. */
export function composerColumnSchema(catalogs: readonly ModelCatalogSnapshot[]) {
  return modelColumnSchema.superRefine((column, context) => {
    const entry = catalogEntry(catalogs, column);
    if (entry && column.settings.maxOutputTokens > entry.maxOutputTokens)
      context.addIssue({
        code: "custom",
        path: ["settings", "maxOutputTokens"],
        message: `Output token limit must be at most ${entry.maxOutputTokens}.`,
      });
    const tool = entry?.search.find((item) => item.mode === column.settings.search.mode);
    if (tool?.maxCalls != null && (column.settings.search.maxCalls ?? 0) > tool.maxCalls)
      context.addIssue({
        code: "custom",
        path: ["settings", "search", "maxCalls"],
        message: `Maximum search calls must be at most ${tool.maxCalls}.`,
      });
  });
}
