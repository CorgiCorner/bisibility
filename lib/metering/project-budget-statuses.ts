import "server-only";
import { ownAllocationTag } from "@/lib/provider-usage/credential-version";
import type {
  AccessContext,
  ApplicableBudgetsQuery,
  BudgetStatus,
  Meter,
  Source,
} from "@usagekit/core";
import { addQuantity, compareQuantity } from "@usagekit/core";
import { mapAdminQueries } from "./admin-batch";
import { platformAllocationTag } from "./paid-quote";

type Connection = { id: string; publicId: string; provider: string };
const sources: readonly Source[] = ["app", "worker", "api", "sdk", "cli", "mcp", "proxy"];

/** Raw figures stay on the server; readers receive only the blocking decision. */
export async function readProjectBudgetStatuses(
  meter: Meter,
  access: AccessContext,
  project: { id: string; ownerId: string },
  connections: readonly Connection[],
  concurrency: 1 | 4 = 4,
) {
  return mapAdminQueries(
    [...connections, null].flatMap((connection) =>
      sources.map((source) => ({ connection, source })),
    ),
    async ({ connection, source }) => {
      const query: ApplicableBudgetsQuery = {
        scope: {
          namespace: access.namespace,
          principal: project.ownerId,
          group: project.id,
          connection: connection?.id ?? "project-budget-observer",
          ...(connection
            ? {
                tags: [
                  ownAllocationTag(connection.provider, connection.id),
                  platformAllocationTag(connection.provider, connection.id),
                ],
              }
            : {}),
        },
        source,
        surface: source === "app" || source === "worker" ? "app" : "programmatic",
        units: ["cents", "units", "customer_cents", "requests", "budget_cents", "paid_attempts"],
      };
      const result = await meter.applicableBudgets(access, query);
      if (result.outcome !== "ok") throw new Error("Meter limits unavailable");
      // Shared figures are never a reader's grant. The service reduces them to
      // an admission decision here; only the original redacted rows leave this helper.
      let blocked = paidWorkBlocked(result.value);
      if (blocked !== true && result.value.some((status) => status.redacted)) {
        const decision = await meter.applicableBudgets(
          { ...access, readablePrincipals: "*" },
          query,
        );
        if (decision.outcome !== "ok") throw new Error("Meter limits unavailable");
        blocked = paidWorkBlocked(decision.value);
      }
      return {
        connection,
        blocked,
        statuses: connection
          ? result.value
          : result.value.filter((status) => status.budget.scope.kind === "group"),
      };
    },
    concurrency,
  );
}

export function paidWorkBlocked(statuses: readonly BudgetStatus[]): boolean | null {
  let unknown = false;
  for (const { budget, used, reserved, redacted } of statuses) {
    const boundary = budget.onExceed === "block" ? budget.limit : (budget.hardLimit ?? null);
    if (redacted && (budget.onExceed === "block" || boundary !== null)) {
      unknown = true;
      continue;
    }
    if (boundary === null) continue;
    if (used === null || reserved === null) {
      unknown = true;
      continue;
    }
    if (compareQuantity(addQuantity(used, reserved), boundary) >= 0) return true;
  }
  return unknown ? null : false;
}
