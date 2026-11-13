"use server";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { annotationNoteHappenedAt } from "@/lib/annotations/note-day";
import { writeAudit } from "@/lib/auth/audit";
import { captureProjectWork } from "@/lib/challenge-report/capture-project-work";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import { getRequestProjectDefaults } from "@/lib/queries/workspace-request-data";
import { emitSignal } from "@/lib/signals/emit";
import { SIGNAL_TYPES } from "@/lib/signals/types";
import {
  createSignalNoteSchema,
  removeSignalNoteSchema,
  searchAnnotationPagesSchema,
} from "@/lib/timeline/types";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateTimelineViews,
} from "./_shared";

async function findScopedKeyword(projectId: string, keywordId: string | undefined) {
  if (!keywordId) return null;
  if (parsePublicId(keywordId)?.prefix !== "kw") {
    throw new Error("Keyword not found.");
  }
  const keyword = await prisma.keyword.findFirst({
    select: { id: true, publicId: true, text: true },
    where: { projectId, publicId: keywordId },
  });
  if (!keyword) {
    throw new Error("Keyword not found.");
  }
  return keyword;
}

function safeSignalNote(signal: {
  id: string;
  keywordId?: string | null;
  payload?: unknown;
  publicId: string;
  severity?: string;
  url?: string | null;
}) {
  return {
    id: signal.publicId,
    keywordId: signal.keywordId ?? null,
    payload: signal.payload ?? null,
    severity: signal.severity ?? "info",
    url: signal.url ?? null,
  };
}

export async function addSignalNote(input: unknown) {
  const data = parseActionInput(createSignalNoteSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", data.projectId, { type: "signal" });
  const keyword = await findScopedKeyword(project.id, data.keywordId);
  let happenedAt: Date | undefined;
  if (data.happenedOn) {
    const defaults = await getRequestProjectDefaults(project.id);
    happenedAt =
      annotationNoteHappenedAt(data.happenedOn, new Date(), defaults?.timezone ?? "UTC") ??
      undefined;
    if (!happenedAt) {
      throw new Error("Choose a day in the chart window, not a future day.");
    }
  }

  const signal = await emitSignal({
    createdById: actor.id,
    ...(happenedAt ? { happenedAt } : {}),
    keywordId: keyword?.id,
    payload: { note: data.note },
    projectId: project.id,
    severity: data.severity,
    source: "manual",
    type: SIGNAL_TYPES.note,
    url: data.url,
  });

  recordAppAction(actor);
  captureProjectWork(actor.id, project.id);
  await writeAudit({
    action: "signal.note_added",
    actorId: actor.id,
    after: safeSignalNote(signal),
    projectId: project.id,
    targetId: signal.publicId,
    targetType: "signal",
  });
  revalidateTimelineViews();

  return { id: signal.publicId };
}

function annotationPageUrl(domain: string | null, path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!domain) return normalized;
  const host = domain.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return `https://${host}${normalized}`;
}

export async function searchAnnotationPages(input: unknown) {
  const data = parseActionInput(searchAnnotationPagesSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", data.projectId, { type: "signal" });
  const pages = await prisma.projectPage.findMany({
    orderBy: { path: "asc" },
    select: { path: true },
    take: 8,
    where: {
      projectId: project.id,
      ...(data.query ? { path: { contains: data.query, mode: "insensitive" } } : {}),
    },
  });
  return {
    pages: pages.map((page) => ({
      path: page.path,
      url: annotationPageUrl(project.domain, page.path),
    })),
  };
}

export async function removeSignalNote(input: unknown) {
  const data = parseActionInput(removeSignalNoteSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "delete", data.projectId, { type: "signal" });
  if (parsePublicId(data.signalId)?.prefix !== "sig") {
    throw new Error("Signal note not found.");
  }
  const signal = await prisma.signal.findFirst({
    select: {
      id: true,
      keywordId: true,
      payload: true,
      publicId: true,
      severity: true,
      source: true,
      type: true,
      url: true,
    },
    where: { projectId: project.id, publicId: data.signalId },
  });
  if (!signal) {
    throw new Error("Signal note not found.");
  }
  if (signal.source !== "manual" || signal.type !== SIGNAL_TYPES.note) {
    throw new Error("Only manual notes can be removed.");
  }

  await prisma.signal.delete({ where: { id: signal.id } });
  recordAppAction(actor);
  await writeAudit({
    action: "signal.note_removed",
    actorId: actor.id,
    before: safeSignalNote(signal),
    projectId: project.id,
    targetId: signal.publicId,
    targetType: "signal",
  });
  revalidateTimelineViews();

  return { removed: true };
}
