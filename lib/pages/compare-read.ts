import "server-only";

import { chartMarkersFromRecords } from "@/lib/annotations/chart-markers";
import { annotationDayKey } from "@/lib/annotations/ruler";
import { prisma } from "@/lib/db/prisma";
import {
  annotationSignalWhere,
  annotationUpdateWhere,
  toAnnotationSignal,
  toAnnotationUpdate,
} from "@/lib/queries/annotations";
import { readChartAnnotations } from "@/lib/queries/chart-annotations";
import { getRequestProjectDefaults } from "@/lib/queries/workspace-request-data";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { dateFromKey, dateKey } from "@/lib/search-insights/dates";
import {
  readSearchInsightsConnection,
  SEARCH_INSIGHTS_SOURCE,
} from "@/lib/search-insights/sync/credentials";
import { readOrganicSessionsConnection } from "@/lib/search-insights/sync/sessions-credentials";
import { getCompareForecast } from "./compare-forecast";
import {
  COMPARE_ANNOTATION_LOOKBACK_DAYS,
  type CompareAnnotationOption,
  type CompareMetricId,
  type CompareMetricOption,
  type CompareTagOption,
  type CompareView,
  compareGroupMath,
  compareIndexedSeries,
  compareVerdict,
  compareWindow,
  defaultCompareAnnotation,
  valuesByDay,
} from "./compare-model";
import { compareGroupQueries } from "./compare-query";
import { canonicalProjectHost } from "./page-path";

const DAY_MS = 24 * 60 * 60 * 1000;

export type LoadPagesCompareInput = {
  annotationId?: string;
  changedTagId?: string;
  metric?: CompareMetricId;
  now?: Date;
  unchangedTagId?: string;
};

function metricOptions(gsc: boolean, analytics: boolean): CompareMetricOption[] {
  return [
    { disabledReason: gsc ? null : "not_connected", id: "clicks" },
    { disabledReason: gsc ? null : "not_connected", id: "impressions" },
    { disabledReason: analytics ? null : "not_connected", id: "sessions" },
  ];
}

function selectedMetric(requested: CompareMetricId | undefined, metrics: CompareMetricOption[]) {
  const enabled = metrics.filter((metric) => metric.disabledReason == null);
  return enabled.find((metric) => metric.id === requested)?.id ?? enabled[0]?.id ?? null;
}

function knownTag(id: string | undefined, tags: readonly CompareTagOption[]) {
  if (!id) return null;
  return tags.some((tag) => tag.id === id) ? id : null;
}

export async function loadPagesCompare(
  projectRef: string,
  input: LoadPagesCompareInput = {},
): Promise<CompareView> {
  const now = input.now ?? new Date();
  const project = await prisma.project.findFirst({
    select: { domain: true, id: true },
    where: { OR: [{ id: projectRef }, { publicId: projectRef }] },
  });
  if (!project) throw new Error("Project not found.");
  const defaults = await getRequestProjectDefaults(project.id);
  const timeZone = defaults?.timezone ?? "UTC";
  const lookbackStart = new Date(now.getTime() - COMPARE_ANNOTATION_LOOKBACK_DAYS * DAY_MS);
  const [tagRows, search, sessions, signals, updates] = await Promise.all([
    prisma.$queryRaw<CompareTagOption[]>`
      SELECT tag."publicId" AS id, tag.name, COUNT(link.id)::int AS pages
      FROM "tags" tag
      JOIN "page_tags" link ON link."tagId" = tag.id
      WHERE tag."projectId" = ${project.id}
      GROUP BY tag.id
      HAVING COUNT(link.id) > 0
      ORDER BY tag.name ASC
      LIMIT 500
    `,
    readSearchInsightsConnection(project.id),
    readOrganicSessionsConnection(project.id),
    prisma.signal.findMany({
      orderBy: [{ happenedAt: "desc" }, { id: "desc" }],
      take: COMPARE_ANNOTATION_LOOKBACK_DAYS,
      where: annotationSignalWhere(project.id, lookbackStart, now),
    }),
    prisma.searchEngineUpdate.findMany({
      orderBy: [{ beginsAt: "desc" }, { id: "desc" }],
      take: 200,
      where: annotationUpdateWhere(lookbackStart, now),
    }),
  ]);
  const tags = tagRows.map((tag) => ({ ...tag, pages: Number(tag.pages) }));
  const annotations = chartMarkersFromRecords({
    range: {
      fromKey: annotationDayKey(lookbackStart, timeZone),
      toKey: annotationDayKey(now, timeZone),
    },
    signals: signals.map(toAnnotationSignal),
    timeZone,
    updates: updates.map(toAnnotationUpdate),
  })
    .sort(
      (left, right) => right.dateKey.localeCompare(left.dateKey) || left.id.localeCompare(right.id),
    )
    .map(
      (marker): CompareAnnotationOption => ({
        dateKey: marker.dateKey,
        id: marker.id,
        title: marker.title,
        ...(marker.added != null ? { added: marker.added } : {}),
        ...(marker.generated ? { generated: marker.generated } : {}),
        ...(marker.removed != null ? { removed: marker.removed } : {}),
      }),
    );
  const metrics = metricOptions(search.connection !== null, sessions.connection !== null);
  const metric = selectedMetric(input.metric, metrics);
  const changedTagId = knownTag(input.changedTagId, tags) ?? tags[0]?.id ?? null;
  const explicitUnchanged = knownTag(input.unchangedTagId, tags);
  const unchangedTagId =
    explicitUnchanged ?? tags.find((tag) => tag.id !== changedTagId)?.id ?? null;
  const through = await finalizedThrough(project.id, search.connection?.property ?? null);
  const annotation = defaultCompareAnnotation(annotations, through, input.annotationId);
  const view: CompareView = {
    annotationId: annotation?.id ?? null,
    annotations,
    changedTagId,
    empty: null,
    metrics,
    result: null,
    selectedMetric: metric,
    tags,
    unchangedTagId,
  };
  if (tags.length === 0) return { ...view, empty: "no_tags" };
  if (annotations.length === 0 || !annotation) return { ...view, empty: "no_annotations" };
  if (!changedTagId || !unchangedTagId || !metric) return { ...view, empty: "choose" };
  if (changedTagId === unchangedTagId) return { ...view, empty: "overlap" };

  const window = compareWindow(annotation.dateKey, through);
  const domain = trackedProjectDomain(project.domain);
  const host = domain ? canonicalProjectHost(domain) : null;
  if (!host) return { ...view, result: await emptyResult(annotation, window, project.id) };
  const queries = compareGroupQueries({
    changedTagId,
    from: dateFromKey(window.before[0] ?? annotation.dateKey),
    ga4Property: sessions.connection?.property ?? null,
    gscProperty: search.connection?.property ?? null,
    host,
    metric,
    projectId: project.id,
    to: dateFromKey(window.after.at(-1) ?? annotation.dateKey),
    unchangedTagId,
  });
  const [counts, daily] = await Promise.all([
    prisma.$queryRaw<{ changed: number; overlap: number; unchanged: number }[]>(queries.counts),
    prisma.$queryRaw<{ day: string; tagId: string; value: number }[]>(queries.daily),
  ]);
  const count = counts[0];
  const overlapPages = Number(count?.overlap ?? 0);
  const changedPages = Number(count?.changed ?? 0);
  const unchangedPages = Number(count?.unchanged ?? 0);
  if (overlapPages > 0 && changedPages === 0 && unchangedPages === 0) {
    return { ...view, empty: "overlap" };
  }
  const changedValues = valuesByDay(
    daily.filter((row) => row.tagId === changedTagId).map(numbered),
  );
  const unchangedValues = valuesByDay(
    daily.filter((row) => row.tagId === unchangedTagId).map(numbered),
  );
  const changed = compareGroupMath({ pageCount: changedPages, values: changedValues, window });
  const unchanged = compareGroupMath({
    pageCount: unchangedPages,
    values: unchangedValues,
    window,
  });
  const history = [...window.before, ...window.after].map((day) => ({
    day,
    value: changedValues.get(day) ?? 0,
  }));
  const forecast = await getCompareForecast({ history, horizonDays: window.day });
  const markers = await readChartAnnotations(project.id, {
    fromKey: window.before[0] ?? annotation.dateKey,
    toKey: window.after.at(-1) ?? annotation.dateKey,
  });
  return {
    ...view,
    result: {
      annotation,
      changed: {
        lowVolume: changed.lowVolume,
        pageCount: changed.pageCount,
        percent: changed.percent,
      },
      day: window.day,
      difference: compareVerdict(window.day, changed, unchanged),
      forecast,
      markers,
      moment: window.moment,
      overlapPages,
      phase: window.phase,
      points: compareIndexedSeries({
        changed: changedValues,
        changedBaseline: changed.before,
        unchanged: unchangedValues,
        unchangedBaseline: unchanged.before,
        window,
      }),
      unchanged: {
        lowVolume: unchanged.lowVolume,
        pageCount: unchanged.pageCount,
        percent: unchanged.percent,
      },
    },
  };
}

function numbered(row: { day: string; value: number }) {
  return { day: row.day, value: Number(row.value) };
}

async function finalizedThrough(projectId: string, property: string | null) {
  if (!property) return null;
  const row = await prisma.searchAnalyticsImport.findFirst({
    orderBy: { newestFinalizedDate: "desc" },
    select: { newestFinalizedDate: true },
    where: {
      newestFinalizedDate: { not: null },
      projectId,
      property,
      source: SEARCH_INSIGHTS_SOURCE,
    },
  });
  return row?.newestFinalizedDate ? dateKey(row.newestFinalizedDate) : null;
}

async function emptyResult(
  annotation: CompareAnnotationOption,
  window: ReturnType<typeof compareWindow>,
  projectId: string,
): Promise<NonNullable<CompareView["result"]>> {
  const changed = compareGroupMath({ pageCount: 0, values: new Map(), window });
  const unchanged = compareGroupMath({ pageCount: 0, values: new Map(), window });
  const forecast = await getCompareForecast({ history: [], horizonDays: window.day });
  return {
    annotation,
    changed: { lowVolume: changed.lowVolume, pageCount: 0, percent: null },
    day: window.day,
    difference: compareVerdict(window.day, changed, unchanged),
    forecast,
    markers: await readChartAnnotations(projectId, {
      fromKey: annotation.dateKey,
      toKey: annotation.dateKey,
    }),
    moment: window.moment,
    overlapPages: 0,
    phase: window.phase,
    points: [],
    unchanged: { lowVolume: unchanged.lowVolume, pageCount: 0, percent: null },
  };
}
