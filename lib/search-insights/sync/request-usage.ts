import "server-only";

import { prisma } from "@/lib/db/prisma";
import type {
  GscSearchAnalyticsQuery,
  GscSearchAnalyticsSession,
} from "@/lib/providers/analytics/gsc-search-analytics";
import { classifyProviderFailure } from "@/lib/providers/failure-class";
import { dateFromKey } from "@/lib/search-insights/dates";

type Operation = "aggregate" | "dimensional" | "probe";
export function accountSearchAnalyticsRequests(input: {
  operation: Operation;
  projectId: string;
  property: string;
  session: GscSearchAnalyticsSession;
  onSuccessfulAttempt?: (id: string) => void;
}): GscSearchAnalyticsSession {
  return {
    property: input.session.property,
    async fetchEnvelope(query: GscSearchAnalyticsQuery) {
      const rowLimit = query.rowLimit ?? 100;
      const attempt = await prisma.searchAnalyticsRequestUsage.create({
        data: {
          dataState: query.dataState ?? "final",
          dimensions: (query.dimensions ?? ["query"]).join(","),
          endDate: dateFromKey(query.endDate),
          operation: input.operation,
          projectId: input.projectId,
          property: input.property,
          rowLimit,
          searchType: query.type ?? "web",
          source: "gsc",
          startDate: dateFromKey(query.startDate),
          startRow: query.startRow ?? 0,
        },
      });
      let envelope: Awaited<ReturnType<GscSearchAnalyticsSession["fetchEnvelope"]>>;
      try {
        envelope = await input.session.fetchEnvelope(query);
      } catch (error) {
        try {
          await prisma.searchAnalyticsRequestUsage.update({
            data: { failureClass: classifyProviderFailure(error) },
            where: { id: attempt.id },
          });
        } catch (persistenceError) {
          console.error("[search-insights] request failure classification could not be stored", {
            error: persistenceError,
            requestUsageId: attempt.id,
          });
        }
        throw error;
      }
      await prisma.searchAnalyticsRequestUsage.update({
        data: { capHit: envelope.rows.length >= rowLimit, returnedRows: envelope.rows.length },
        where: { id: attempt.id },
      });
      input.onSuccessfulAttempt?.(attempt.id);
      return envelope;
    },
  };
}
