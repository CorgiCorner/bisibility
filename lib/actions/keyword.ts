"use server";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { addKeywordSchema, addKeywordsSchema, updateKeywordSchema } from "@/lib/schemas/keyword";
import { resolveKeywordLocation } from "@/lib/serp/location-service";
import { DEFAULT_SERP_MARKET } from "@/lib/serp/markets";
import { normalizeSchedule } from "./_schedule";
import {
  getActionActor,
  parseActionInput,
  requireKeywordScope,
  requireProjectScope,
} from "./_shared";
import {
  addTags,
  consumeSavedKeywords,
  createKeywordBatch,
  createKeywordBatchSet,
  promotedSavedKeywordPairs,
  revalidateKeywords,
} from "./keyword-helpers";
import {
  keywordLocationResolverInput,
  resolveKeywordRows,
  uniqueLocationWarnings,
} from "./keyword-location";
import { addKeywordsMatrix as addKeywordsMatrixImpl } from "./keyword-matrix";

export async function addKeywordsMatrix(input: unknown) {
  return addKeywordsMatrixImpl(input);
}

function publicKeywordView<T extends { id: string; publicId: string | null }>(keyword: T) {
  if (!keyword.publicId) throw new Error("Keyword public ID is not available.");
  return { ...keyword, id: keyword.publicId };
}

export async function addKeyword(input: unknown) {
  const data = parseActionInput(addKeywordSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", data.projectId, { type: "keyword" });
  const schedule = data.schedule ? normalizeSchedule(data.schedule) : null;
  // Keep the legacy location string in sync so the composite unique still dedups.
  const resolved = await resolveKeywordLocation(
    keywordLocationResolverInput({
      city: data.city,
      location: data.location,
      locationKey: data.locationKey,
      projectId: project.id,
    }),
  );
  const locationName = resolved.location.displayName;
  const keyword = await prisma.$transaction(async (tx) => {
    const [created] = await createKeywordBatch(tx, {
      device: data.device,
      keywords: [data.keyword],
      location: locationName,
      locationId: resolved.location.id,
      projectId: project.id,
      schedule,
      tags: [],
      targetUrl: data.targetUrl,
      topic: data.topic,
      intent: data.intent,
    });
    const stored =
      created ??
      (await tx.keyword.findUnique({
        select: {
          id: true,
          intent: true,
          publicId: true,
          targetUrl: true,
          text: true,
          topic: true,
        },
        where: {
          projectId_text_locationId_device: {
            device: data.device,
            locationId: resolved.location.id,
            projectId: project.id,
            text: data.keyword,
          },
        },
      }));
    if (!stored) throw new Error("Keyword could not be created.");

    await addTags(tx, project.id, [stored.id], data.tags);
    await writeAudit(
      {
        action: "keyword.add",
        actorId: actor.id,
        after: {
          intent: stored.intent,
          keywordId: stored.publicId,
          tags: data.tags,
          targetUrl: stored.targetUrl,
          text: stored.text,
          topic: stored.topic,
        },
        projectId: project.id,
        targetId: stored.publicId,
        targetType: "keyword",
      },
      tx,
    );
    return stored;
  });
  revalidateKeywords(keyword.publicId);

  return { ...publicKeywordView(keyword), warning: resolved.warning };
}

export async function addKeywords(input: unknown) {
  const data = parseActionInput(addKeywordsSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", data.projectId, { type: "keyword" });
  const schedule = data.schedule ? normalizeSchedule(data.schedule) : null;
  const rows = data.rows;
  if (rows?.length) {
    const resolvedRows = await resolveKeywordRows(rows, project.id);
    const keywords = await prisma.$transaction(async (tx) => {
      const persisted = await createKeywordBatchSet(
        tx,
        project.id,
        resolvedRows.map(({ resolved, row }) => ({
          device: row.device,
          keyword: row.keyword,
          location: resolved.location.displayName,
          locationId: resolved.location.id,
          schedule,
          tags: row.tags,
          targetUrl: row.targetUrl,
          topic: row.topic,
          intent: row.intent,
        })),
      );
      const promotedPairs = persisted.accepted.flatMap(({ keyword }, index) => {
        const resolved = resolvedRows[index]?.resolved;
        return resolved ? promotedSavedKeywordPairs([keyword], resolved.location.canonicalKey) : [];
      });
      const created = persisted.created;
      const targetKeyword = created.length === 1 ? created[0] : null;
      await writeAudit(
        {
          action: "keyword.batch_add",
          actorId: actor.id,
          after: {
            keywordIds: created.map((keyword) => keyword.publicId),
            rows: rows.map((row) => ({
              device: row.device,
              keyword: row.keyword,
              location: row.locationKey ?? row.location,
              tags: row.tags,
              targetUrl: row.targetUrl ?? null,
              topic: row.topic ?? null,
              intent: row.intent ?? null,
            })),
          },
          projectId: project.id,
          targetId: targetKeyword?.publicId ?? project.publicId,
          targetType: targetKeyword ? "keyword" : "project",
        },
        tx,
      );
      await consumeSavedKeywords(tx, project.id, data.consumeSavedIds, promotedPairs);
      return created;
    });
    const warnings = uniqueLocationWarnings(resolvedRows);
    revalidateKeywords();
    return {
      created: keywords.length,
      keywords: keywords.map(publicKeywordView),
      warning: warnings[0] ?? null,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }
  // One location per batch (all keywords share the country/city); resolve once.
  const resolved = await resolveKeywordLocation(
    keywordLocationResolverInput({
      city: data.city,
      location: data.location,
      locationKey: data.locationKey,
      projectId: project.id,
    }),
  );
  const keywordText = data.keywords ?? [];
  const keywords = await prisma.$transaction(async (tx) => {
    const persisted = await createKeywordBatchSet(
      tx,
      project.id,
      keywordText.map((keyword) => ({
        device: data.device,
        keyword,
        location: resolved.location.displayName,
        locationId: resolved.location.id,
        schedule,
        tags: data.tags,
        targetUrl: data.targetUrl,
        topic: data.topic,
        intent: data.intent,
      })),
    );
    const created = persisted.created;
    const targetKeyword = created.length === 1 ? created[0] : null;
    await writeAudit(
      {
        action: "keyword.batch_add",
        actorId: actor.id,
        after: {
          keywordIds: created.map((keyword) => keyword.publicId),
          intent: data.intent ?? null,
          tags: data.tags,
          targetUrl: data.targetUrl ?? null,
          topic: data.topic ?? null,
        },
        projectId: project.id,
        targetId: targetKeyword?.publicId ?? project.publicId,
        targetType: targetKeyword ? "keyword" : "project",
      },
      tx,
    );
    await consumeSavedKeywords(
      tx,
      project.id,
      data.consumeSavedIds,
      promotedSavedKeywordPairs(
        persisted.accepted.map(({ keyword }) => keyword),
        resolved.location.canonicalKey,
      ),
    );

    return created;
  });

  revalidateKeywords();
  return {
    created: keywords.length,
    keywords: keywords.map(publicKeywordView),
    warning: resolved.warning,
  };
}

export async function updateKeyword(input: unknown) {
  const data = parseActionInput(updateKeywordSchema, input);
  const actor = await getActionActor();
  const keyword = await requireKeywordScope(actor, "update", data.keywordId);
  const before = await prisma.keyword.findUnique({
    select: {
      device: true,
      intent: true,
      location: true,
      targetUrl: true,
      text: true,
      topic: true,
    },
    where: { id: keyword.id },
  });
  // City-only edits resolve against the existing country string.
  const resolved =
    data.locationKey || data.location || data.city
      ? await resolveKeywordLocation(
          keywordLocationResolverInput({
            city: data.city,
            location: data.location ?? before?.location ?? DEFAULT_SERP_MARKET,
            locationKey: data.locationKey,
            projectId: keyword.projectId,
          }),
        )
      : null;
  const updated = await prisma.keyword.update({
    data: {
      device: data.device,
      location: resolved?.location.displayName ?? data.location,
      locationId: resolved?.location.id,
      text: data.keyword,
      ...(data.targetUrl !== undefined ? { targetUrl: data.targetUrl } : {}),
      intent: data.intent,
      topic: data.topic,
    },
    select: { id: true, intent: true, publicId: true, targetUrl: true, text: true, topic: true },
    where: { id: keyword.id },
  });

  if (data.tags) {
    await prisma.keywordTag.deleteMany({ where: { keywordId: keyword.id } });
    await addTags(prisma, keyword.projectId, [keyword.id], data.tags);
  }

  await writeAudit({
    action: "keyword.update",
    actorId: actor.id,
    after: { ...updated, tags: data.tags },
    before,
    projectId: keyword.projectId,
    targetId: updated.publicId,
    targetType: "keyword",
  });
  revalidateKeywords(updated.publicId);

  return { ...publicKeywordView(updated), warning: resolved?.warning ?? null };
}
