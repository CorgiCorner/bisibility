import { isPublicIdOfType } from "@/lib/db/public-id";
import { viewRevisionSchema } from "@/lib/saved-views/canonical-model";
import { z } from "zod";

export const dashboardComparisonSelectionSchema = z
  .object({
    viewId: z.string().refine((id) => isPublicIdOfType(id, "viw")),
    revision: viewRevisionSchema,
  })
  .strict();
export type DashboardComparisonSelection = z.infer<typeof dashboardComparisonSelectionSchema>;

/** An explicit empty/malformed URL never resurrects a remembered comparison. */
export function effectiveDashboardComparisonSelection(
  explicit: string | string[] | undefined,
  retained: DashboardComparisonSelection | null | undefined,
) {
  if (explicit === undefined)
    return retained
      ? { state: "selected" as const, selection: retained }
      : { state: "missing" as const };
  if (explicit === "") return { state: "missing" as const };
  if (typeof explicit !== "string" || explicit.length > 512) return { state: "invalid" as const };
  try {
    const value = dashboardComparisonSelectionSchema.safeParse(JSON.parse(explicit));
    return value.success
      ? { state: "selected" as const, selection: value.data }
      : { state: "invalid" as const };
  } catch {
    return { state: "invalid" as const };
  }
}
