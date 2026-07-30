"use server";

import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { refreshKeywordDispatchStates } from "@/lib/rank-check/dispatcher-state";
import {
  bulkKeywordFrequencySchema,
  bulkKeywordIdsSchema,
  bulkKeywordTagSchema,
  bulkKeywordTargetSchema,
} from "@/lib/schemas/keyword";
import { normalizeSchedule } from "./_schedule";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";
import { addTags, keywordIdsWhere, revalidateKeywords } from "./keyword-helpers";

function auditKeyword<T extends { id: string; publicId: string }>(keyword: T) {
  const { id: _internalId, publicId, ...values } = keyword;
  return {
    ...values,
    id: requiredPublicAuditId(publicId, "kw", "Keyword"),
  };
}

export async function bulkDeleteKeywords(input: unknown) {
  const data = parseActionInput(bulkKeywordIdsSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "delete", data.projectId, { type: "keyword" });
  const keywords = await prisma.keyword.findMany({
    select: { id: true, publicId: true, text: true },
    where: keywordIdsWhere(project.id, data.keywordIds),
  });

  await prisma.keyword.deleteMany({ where: { id: { in: keywords.map((keyword) => keyword.id) } } });
  await writeAudit({
    action: "keyword.bulk_delete",
    actorId: actor.id,
    before: keywords.map(auditKeyword),
    projectId: project.id,
    targetId: project.publicId,
    targetType: "project",
  });
  revalidateKeywords();

  return { deleted: keywords.length };
}

export async function bulkTagKeywords(input: unknown) {
  const data = parseActionInput(bulkKeywordTagSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "keyword" });
  const keywords = await prisma.keyword.findMany({
    select: { id: true, publicId: true },
    where: keywordIdsWhere(project.id, data.keywordIds),
  });

  await addTags(
    prisma,
    project.id,
    keywords.map((keyword) => keyword.id),
    data.tags,
  );
  await writeAudit({
    action: "keyword.bulk_tag",
    actorId: actor.id,
    after: { keywordIds: keywords.map((keyword) => auditKeyword(keyword).id), tags: data.tags },
    projectId: project.id,
    targetId: project.publicId,
    targetType: "project",
  });
  revalidateKeywords();

  return { tagged: keywords.length };
}

export async function bulkSetTargetUrl(input: unknown) {
  const data = parseActionInput(bulkKeywordTargetSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "keyword" });
  const before = await prisma.keyword.findMany({
    select: { id: true, publicId: true, targetUrl: true },
    where: keywordIdsWhere(project.id, data.keywordIds),
  });

  await prisma.keyword.updateMany({
    data: { targetUrl: data.targetUrl },
    where: { id: { in: before.map((keyword) => keyword.id) } },
  });
  await writeAudit({
    action: "keyword.bulk_set_target",
    actorId: actor.id,
    after: { targetUrl: data.targetUrl },
    before: before.map(auditKeyword),
    projectId: project.id,
    targetId: project.publicId,
    targetType: "project",
  });
  revalidateKeywords();

  return { updated: before.length };
}

export async function bulkClearTargetUrls(input: unknown) {
  const data = parseActionInput(bulkKeywordIdsSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "keyword" });
  const before = await prisma.keyword.findMany({
    select: { id: true, publicId: true, targetUrl: true },
    where: keywordIdsWhere(project.id, data.keywordIds),
  });

  await prisma.keyword.updateMany({
    data: { targetUrl: null },
    where: { id: { in: before.map((keyword) => keyword.id) } },
  });
  await writeAudit({
    action: "keyword.bulk_clear_target",
    actorId: actor.id,
    after: { targetUrl: null },
    before: before.map(auditKeyword),
    projectId: project.id,
    targetId: project.publicId,
    targetType: "project",
  });
  revalidateKeywords();

  return { updated: before.length };
}

export async function bulkSetFrequency(input: unknown) {
  const data = parseActionInput(bulkKeywordFrequencySchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "keyword" });
  const schedule = normalizeSchedule(data.schedule);
  const keywords = await prisma.keyword.findMany({
    select: { id: true, publicId: true },
    where: keywordIdsWhere(project.id, data.keywordIds),
  });

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    await Promise.all(
      keywords.map((keyword) => {
        const keywordSchedule = normalizeSchedule(data.schedule, now, keyword.id);
        return tx.keywordSchedule.upsert({
          create: { ...keywordSchedule, keywordId: keyword.id },
          update: keywordSchedule,
          where: { keywordId: keyword.id },
        });
      }),
    );
    await refreshKeywordDispatchStates({ keywordIds: keywords.map((keyword) => keyword.id) }, tx);
  });
  await writeAudit({
    action: "keyword.bulk_set_frequency",
    actorId: actor.id,
    after: { keywordIds: keywords.map((keyword) => auditKeyword(keyword).id), schedule },
    projectId: project.id,
    targetId: project.publicId,
    targetType: "project",
  });
  revalidateKeywords();

  return { updated: keywords.length };
}
