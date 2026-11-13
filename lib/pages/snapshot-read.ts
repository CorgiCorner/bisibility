import "server-only";

import { AI_RESEARCH_PROVIDER_ID } from "@/lib/ai-research/catalog-types";
import { getConversionSources } from "@/lib/conversions/queries";
import { resolveConversionSource } from "@/lib/conversions/selection";
import { prisma } from "@/lib/db/prisma";
import { readChartAnnotations } from "@/lib/queries/chart-annotations";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { readSearchInsightsConnection } from "@/lib/search-insights/sync/credentials";
import { readOrganicSessionsConnection } from "@/lib/search-insights/sync/sessions-credentials";
import { canonicalProjectHost } from "./page-path";
import { existingVsNewQueries } from "./snapshot-query";
import {
  cumulativeMembership,
  fillDailyMembership,
  selectSnapshotMetric,
  shareFromNew,
  sinceSnapshotWindow,
  snapshotSeriesWindow,
  utcDateKey,
} from "./snapshot-series";
import type {
  ActivePageSnapshot,
  ExistingVsNewView,
  SnapshotMetricId,
  SnapshotMetricOption,
  SnapshotSeriesPoint,
  SnapshotSpan,
} from "./snapshot-view";

const emptySummary = {
  existingPages: 0,
  existingValue: 0,
  freshPages: 0,
  freshValue: 0,
  removedPages: 0,
  removedValue: 0,
  snapshotPages: 0,
};

function dayKey(value: Date | string) {
  return value instanceof Date ? utcDateKey(value) : String(value).slice(0, 10);
}

export async function getActivePageSnapshot(
  projectRef: string,
): Promise<ActivePageSnapshot | null> {
  const project = await prisma.project.findFirst({
    select: { id: true },
    where: { OR: [{ id: projectRef }, { publicId: projectRef }] },
  });
  if (!project) return null;
  const row = await prisma.pageSnapshot.findFirst({
    select: {
      id: true,
      label: true,
      pageCount: true,
      signal: { select: { publicId: true } },
      source: true,
      takenOn: true,
    },
    where: { archivedAt: null, projectId: project.id },
  });
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    pageCount: row.pageCount,
    signalPublicId: row.signal?.publicId ?? null,
    source: row.source,
    takenOn: utcDateKey(row.takenOn),
  };
}

function metricOptions(input: {
  ai: boolean;
  conversionsReady: boolean;
  ga4: boolean;
  gsc: boolean;
  plausible: boolean;
}): SnapshotMetricOption[] {
  return [
    { disabledReason: input.gsc ? null : "not_connected", id: "clicks", provider: null },
    {
      disabledReason: input.ga4 || input.plausible ? null : "not_connected",
      id: "sessions",
      provider: input.ga4 ? "ga4" : input.plausible ? "plausible" : null,
    },
    {
      disabledReason: input.conversionsReady ? null : "no_data",
      id: "conversions",
      provider: null,
    },
    { disabledReason: input.ai ? null : "not_connected", id: "ai_cites", provider: null },
  ];
}

export async function loadExistingVsNew(
  projectRef: string,
  input: {
    conversionSource?: string | null;
    metric?: SnapshotMetricId;
    now?: Date;
    span: SnapshotSpan;
    tagId?: string;
  },
): Promise<ExistingVsNewView> {
  const now = input.now ?? new Date();
  const project = await prisma.project.findFirst({
    select: { domain: true, id: true },
    where: { OR: [{ id: projectRef }, { publicId: projectRef }] },
  });
  if (!project) throw new Error("Project not found.");
  const [search, sessionsConnection, connections, snapshot, conversionSources, defaults] =
    await Promise.all([
      readSearchInsightsConnection(project.id),
      readOrganicSessionsConnection(project.id),
      prisma.providerConnection.findMany({
        select: { provider: true },
        where: { enabled: true, projectId: project.id, status: "connected" },
      }),
      getActivePageSnapshot(project.id),
      getConversionSources(project.id),
      prisma.projectDefaults.findUnique({
        select: { timezone: true },
        where: { projectId: project.id },
      }),
    ]);
  const conversionSelection = resolveConversionSource({
    requested: input.conversionSource,
    sources: conversionSources,
  });
  const ga4 = sessionsConnection.connection !== null;
  const plausible = connections.some((connection) => connection.provider === "plausible");
  const metrics = metricOptions({
    ai: connections.some((connection) => connection.provider === AI_RESEARCH_PROVIDER_ID),
    conversionsReady: conversionSelection.options.some((source) => source.hasData),
    ga4,
    gsc: search.connection !== null,
    plausible,
  }).map((option) =>
    option.id === "conversions" ? { ...option, provider: conversionSelection.selected } : option,
  );
  const selected = selectSnapshotMetric(input.metric, metrics);
  const window = snapshot
    ? sinceSnapshotWindow(snapshot.takenOn, now, input.span, defaults?.timezone ?? "UTC")
    : snapshotSeriesWindow(now, now);
  const view: ExistingVsNewView = {
    conversionSelection,
    markers: [],
    metrics,
    points: [],
    selected,
    sessionsNote: selected === "sessions" && !ga4 && plausible ? "rolling_28_days" : null,
    summary: { ...emptySummary, snapshotPages: snapshot?.pageCount ?? 0 },
    tags: [],
    window: { from: utcDateKey(window.from), to: utcDateKey(window.to) },
  };
  const domain = trackedProjectDomain(project.domain);
  const host = domain ? canonicalProjectHost(domain) : null;
  if (!snapshot || !selected || !host) return view;
  const queries = existingVsNewQueries({
    conversionSource: conversionSelection.selected,
    from: window.from,
    ga4Property: sessionsConnection.connection?.property ?? null,
    gscProperty: search.connection?.property ?? null,
    host,
    metric: selected,
    projectId: project.id,
    sessions: ga4 ? "ga4" : plausible ? "plausible" : "none",
    tagId: input.tagId,
    to: window.to,
  });
  const [daily, summary, tags] = await Promise.all([
    prisma.$queryRaw<SnapshotSeriesPoint[]>(queries.daily),
    prisma.$queryRaw<
      { existingPages: number; freshPages: number; removedPages: number; snapshotPages: number }[]
    >(queries.summary),
    prisma.$queryRaw<
      {
        existingPages: number;
        existingValue: number;
        freshPages: number;
        freshValue: number;
        name: string;
        tagId: string;
      }[]
    >(queries.tags),
  ]);
  const points = cumulativeMembership(
    fillDailyMembership(
      window.from,
      window.to,
      daily.map((row) => ({
        day: dayKey(row.day),
        existing: Number(row.existing),
        fresh: Number(row.fresh),
        removed: Number(row.removed),
      })),
    ),
  );
  const last = points.at(-1);
  const totals = summary[0];
  view.markers = await readChartAnnotations(project.id, {
    fromKey: utcDateKey(window.from),
    toKey: utcDateKey(window.to),
  });
  view.points = points;
  view.summary = {
    existingPages: Number(totals?.existingPages ?? 0),
    existingValue: last?.existing ?? 0,
    freshPages: Number(totals?.freshPages ?? 0),
    freshValue: last?.fresh ?? 0,
    removedPages: Number(totals?.removedPages ?? 0),
    removedValue: last?.removed ?? 0,
    snapshotPages: Number(totals?.snapshotPages ?? snapshot.pageCount),
  };
  view.tags = tags.map((row) => ({
    existingPages: Number(row.existingPages),
    existingValue: Number(row.existingValue),
    freshPages: Number(row.freshPages),
    freshValue: Number(row.freshValue),
    name: row.name,
    share: shareFromNew(Number(row.existingValue), Number(row.freshValue)),
    tagId: row.tagId,
  }));
  return view;
}
