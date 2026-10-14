import "server-only";

import { businessReadProjectScope } from "@/lib/business-location-store/access";
import type { BusinessDatabase, BusinessStoreContext } from "@/lib/business-location-store/context";
import {
  BusinessLocationConflictError,
  BusinessLocationUnavailableError,
} from "@/lib/business-location-store/errors";
import { prisma } from "@/lib/db/prisma";
import { RankReportCapacityError } from "@/lib/rank-reports/errors";
import { RANK_REPORT_HOST_LIMITS } from "@/lib/rank-reports/host-policy";
import { localSubjectChoices } from "./cohort";
import type { LocalDashboardContext } from "./model";
import { type DashboardLocalSelection, effectiveLocalSelection } from "./selection";
import { resolveDashboardLocalSubject } from "./subject";

/** Only the Local preset calls this read-only adapter. General does not load Local observations. */
export async function loadDashboardLocalContext(
  projectRef: string,
  context: BusinessStoreContext,
  explicit: string | string[] | undefined,
  retained: DashboardLocalSelection | null | undefined,
  asOf: Date,
  db: BusinessDatabase = prisma,
): Promise<LocalDashboardContext> {
  const resolved = effectiveLocalSelection(explicit, retained);
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const scope = await businessReadProjectScope(tx, context, projectRef, "business_assignment");
      let choices: LocalDashboardContext["choices"] = [];
      try {
        choices = await localSubjectChoices(tx, scope, RANK_REPORT_HOST_LIMITS.maxTargets, asOf);
        if (resolved.status !== "selected")
          return {
            state: resolved.status === "invalid" ? "invalid" : "missing",
            choices,
            selection: null,
          };
        await resolveDashboardLocalSubject(tx, scope, resolved.selection, asOf);
        return { state: "ready", choices, selection: resolved.selection };
      } catch (cause) {
        if (cause instanceof RankReportCapacityError)
          return { state: "capacity", choices: [], selection: null };
        if (
          cause instanceof BusinessLocationUnavailableError ||
          cause instanceof BusinessLocationConflictError
        )
          return { state: "unavailable", choices, selection: null };
        throw cause;
      }
    },
    { isolationLevel: "RepeatableRead" },
  );
}
