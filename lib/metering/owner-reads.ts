import "server-only";
import type { AccessContext, Meter, UsagePage, UsageQuery } from "@usagekit/core";
import { loadUsageView } from "@usagekit/views";
import { ownerDetail, ownerDetailSummary, usageUnits } from "./user-views";

export async function readOwnerUsage(
  meter: Meter,
  access: AccessContext,
  query: Pick<UsageQuery, "scope" | "from" | "to">,
  owner: string,
  refs: ReadonlyMap<string, string>,
  resolveConnections?: (ids: string[]) => Promise<ReadonlyMap<string, string>>,
) {
  const pages: UsagePage[] = [];
  // Keep the exact raw pages used by the shared view loader. Independent first-page
  // reads have different snapshot tokens even when no operation has changed.
  const observedMeter: Meter = {
    ...meter,
    usage: async (access, query) => {
      const result = await meter.usage(access, query);
      if (result.outcome === "ok") pages.push(result.value);
      return result;
    },
  };
  const input = {
    ...query,
    units: usageUnits,
    groupBy: ["principal", "connection", "provider", "surface", "source"] as const,
    limit: 100,
  };
  const detail = await loadUsageView(observedMeter, access, input);
  if (detail.state === "unavailable" || detail.state === "forbidden")
    throw new Error("Usage unavailable");
  const detailRows = [...detail.rows];
  const seen = new Set<string>();
  while (detail.nextCursor && seen.size < 100 && !seen.has(detail.nextCursor)) {
    seen.add(detail.nextCursor);
    const next = await loadUsageView(observedMeter, access, {
      ...input,
      cursor: detail.nextCursor,
    });
    if (
      next.state === "unavailable" ||
      next.state === "forbidden" ||
      next.watermark !== detail.watermark ||
      next.asOf !== detail.asOf
    )
      throw new Error("Usage snapshot changed");
    detailRows.push(...next.rows);
    detail.nextCursor = next.nextCursor;
  }
  const missing = [
    ...new Set(
      detailRows
        .filter((row) => row.dimensions.principal === owner)
        .map((row) => row.dimensions.connection)
        .filter((id) => id && !refs.has(id)),
    ),
  ];
  const resolved = missing.length && resolveConnections ? await resolveConnections(missing) : [];
  const publicRefs = new Map([...refs, ...resolved]);
  const summary = ownerDetailSummary(pages, owner);
  return {
    summary,
    detail: ownerDetail(
      { ...detail, rows: detailRows, state: detailRows.length ? "ok" : "empty" },
      owner,
      publicRefs,
    ),
    truncated: Boolean(detail.nextCursor) || !summary.complete,
  };
}
