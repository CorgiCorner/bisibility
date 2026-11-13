import "server-only";

import {
  type ChartAnnotationRange,
  chartMarkersFromRecords,
} from "@/lib/annotations/chart-markers";
import { annotationDayKey } from "@/lib/annotations/ruler";
import { prisma } from "@/lib/db/prisma";
import { requireReadableProject } from "./_auth";
import {
  annotationSignalWhere,
  annotationUpdateWhere,
  toAnnotationSignal,
  toAnnotationUpdate,
} from "./annotations";
import { getRequestProjectDefaults } from "./workspace-request-data";

const SIGNAL_READ_LIMIT = 400;
const UPDATE_READ_LIMIT = 200;
const RANGE_PAD_MS = 36 * 60 * 60 * 1000;

function queryWindow(range: ChartAnnotationRange) {
  const fromKey = range.fromKey <= range.toKey ? range.fromKey : range.toKey;
  const toKey = range.fromKey <= range.toKey ? range.toKey : range.fromKey;
  const start = new Date(new Date(`${fromKey}T00:00:00.000Z`).getTime() - RANGE_PAD_MS);
  const end = new Date(new Date(`${toKey}T23:59:59.999Z`).getTime() + RANGE_PAD_MS);
  return { end, start };
}

export async function readChartAnnotations(projectId: string, range: ChartAnnotationRange) {
  const defaults = await getRequestProjectDefaults(projectId);
  const timeZone = defaults?.timezone ?? "UTC";
  const window = queryWindow(range);
  const [signals, updates] = await Promise.all([
    prisma.signal.findMany({
      orderBy: [{ happenedAt: "desc" }, { id: "desc" }],
      take: SIGNAL_READ_LIMIT,
      where: annotationSignalWhere(projectId, window.start, window.end),
    }),
    prisma.searchEngineUpdate.findMany({
      orderBy: [{ beginsAt: "desc" }, { id: "desc" }],
      take: UPDATE_READ_LIMIT,
      where: annotationUpdateWhere(window.start, window.end),
    }),
  ]);
  return chartMarkersFromRecords({
    range,
    signals: signals.map(toAnnotationSignal),
    timeZone,
    updates: updates.map(toAnnotationUpdate),
  });
}

/** Markers for one chart range. The day keys follow the project zone, same as the annotations page. */
export async function getChartAnnotations(projectRef: string, range: { from: Date; to: Date }) {
  const { project } = await requireReadableProject(projectRef);
  const defaults = await getRequestProjectDefaults(project.id);
  const timeZone = defaults?.timezone ?? "UTC";
  return readChartAnnotations(project.id, {
    fromKey: annotationDayKey(range.from, timeZone),
    toKey: annotationDayKey(range.to, timeZone),
  });
}
