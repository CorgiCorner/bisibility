import "server-only";

import type { AnnotationsView } from "@/lib/annotations/types";
import { annotationWindow } from "@/lib/annotations/types";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { requireReadableProject } from "./_auth";
import { getRequestProjectDefaults } from "./workspace-request-data";

const MAX_ROWS = 300;

export const annotationContextSources = ["manual", "deploy", "cms", "api", "sitemap"] as const;

export type { AnnotationsView };

export function payloadRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

/** Context signals only. Rank changes and search analytics stay on their own screens. */
export function annotationSignalWhere(
  projectId: string,
  start: Date,
  end: Date,
): Prisma.SignalWhereInput {
  return {
    happenedAt: { gte: start, lte: end },
    projectId,
    OR: [
      { source: { in: [...annotationContextSources] } },
      { source: "url_inspection", type: "url.deindexed" },
    ],
  };
}

export function annotationUpdateWhere(start: Date, end: Date): Prisma.SearchEngineUpdateWhereInput {
  return {
    beginsAt: { lte: end },
    engine: "google",
    OR: [{ endsAt: null }, { endsAt: { gte: start } }],
  };
}

type AnnotationSignalRow = {
  createdBy?: { email: string | null; name: string | null } | null;
  happenedAt: Date;
  payload: Prisma.JsonValue | null;
  publicId: string;
  source: string;
  type: string;
  url: string | null;
};

type AnnotationUpdateRow = {
  beginsAt: Date;
  endsAt: Date | null;
  externalId: string;
  name: string;
  service: string;
  uri: string;
};

export function toAnnotationSignal(signal: AnnotationSignalRow) {
  return {
    actor: signal.createdBy?.name?.trim() || signal.createdBy?.email || null,
    happenedAt: signal.happenedAt.toISOString(),
    id: signal.publicId,
    payload: payloadRecord(signal.payload),
    source: signal.source,
    type: signal.type,
    url: signal.url,
  };
}

export function toAnnotationUpdate(update: AnnotationUpdateRow) {
  return {
    beginsAt: update.beginsAt.toISOString(),
    endsAt: update.endsAt?.toISOString() ?? null,
    id: update.externalId,
    name: update.name,
    service: update.service,
    uri: update.uri,
  };
}

export async function getAnnotationsView(
  projectRef: string,
  input: { now?: Date } = {},
): Promise<AnnotationsView> {
  const { project } = await requireReadableProject(projectRef);
  const now = input.now ?? new Date();
  const window = annotationWindow(now);
  const [defaults, signals, updates] = await Promise.all([
    getRequestProjectDefaults(project.id),
    prisma.signal.findMany({
      include: { createdBy: { select: { email: true, name: true } } },
      orderBy: [{ happenedAt: "desc" }, { id: "desc" }],
      take: MAX_ROWS,
      where: annotationSignalWhere(project.id, window.start, window.end),
    }),
    prisma.searchEngineUpdate.findMany({
      orderBy: [{ beginsAt: "desc" }, { id: "desc" }],
      where: annotationUpdateWhere(window.start, window.end),
    }),
  ]);

  return {
    now: now.toISOString(),
    signals: signals.map(toAnnotationSignal),
    timeZone: defaults?.timezone ?? "UTC",
    updates: updates.map(toAnnotationUpdate),
    windowStart: window.start.toISOString(),
  };
}
