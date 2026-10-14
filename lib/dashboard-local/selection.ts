import { assignmentScopeSchema, MAX_BUSINESS_VERSION } from "@/lib/business-location-store/schema";
import { referenceSchema } from "@/lib/business-locations/schema";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { z } from "zod";

/** Presentation selects an existing explicit assignment; it never creates/updates an assignment. */
export const dashboardLocalSelectionSchema = z
  .object({
    scope: assignmentScopeSchema,
    locationId: z.string().refine((id) => isPublicIdOfType(id, "biz")),
    identityRevisionId: referenceSchema,
    assignmentRevision: z.int().positive().max(MAX_BUSINESS_VERSION),
  })
  .strict();
export type DashboardLocalSelection = z.infer<typeof dashboardLocalSelectionSchema>;
export type ParsedDashboardLocalSelection =
  | { status: "absent" }
  | { status: "invalid" }
  | { status: "selected"; selection: DashboardLocalSelection };

/** Undefined is absent; every present malformed/empty/multiple URL value blocks Local. */
export function parseDashboardLocalSelection(
  value: string | string[] | undefined,
): ParsedDashboardLocalSelection {
  if (value === undefined) return { status: "absent" };
  if (typeof value !== "string" || !value || value.length > 2048) return { status: "invalid" };
  try {
    const result = dashboardLocalSelectionSchema.safeParse(JSON.parse(value));
    return result.success ? { status: "selected", selection: result.data } : { status: "invalid" };
  } catch {
    return { status: "invalid" };
  }
}

export function effectiveLocalSelection(
  explicit: string | string[] | undefined,
  retained: DashboardLocalSelection | null | undefined,
) {
  const parsed = parseDashboardLocalSelection(explicit);
  return parsed.status === "absent"
    ? retained
      ? { status: "selected" as const, selection: retained }
      : { status: "absent" as const }
    : parsed;
}
