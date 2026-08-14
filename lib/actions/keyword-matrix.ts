"use server";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { requireTrackedDomain } from "@/lib/projects/tracked-domain";
import { type AddKeywordsMatrixInput, addKeywordsMatrixSchema } from "@/lib/schemas/keyword";
import { countryCodeForMarketName, normalizeCanonicalLocationKey } from "@/lib/serp/location";
import { denormalizedLocationLabel } from "@/lib/serp/location-label";
import { resolveKeywordLocation } from "@/lib/serp/location-service";
import { normalizeSchedule } from "./_schedule";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";
import { uniqueKeywordTexts } from "./keyword-create";
import {
  consumeSavedKeywords,
  createKeywordBatchSet,
  promotedSavedKeywordPairs,
  publicKeywordView,
  revalidateKeywords,
} from "./keyword-helpers";

type CreatedKeyword = { id: string; publicId: string };
type MatrixLocationInput = AddKeywordsMatrixInput["locations"][number];

function matrixLocationKey(selection: MatrixLocationInput) {
  return "locationKey" in selection
    ? selection.locationKey
    : (countryCodeForMarketName(selection.country) ?? selection.country);
}

function matrixSelectionInput(selection: MatrixLocationInput, projectId: string) {
  if ("country" in selection) {
    const countryCode = countryCodeForMarketName(selection.country);
    if (!countryCode) {
      throw new Error(`Unsupported country: ${selection.country}`);
    }
    return { projectId, selection: { countryCode, kind: "country" as const } };
  }
  const normalized = normalizeCanonicalLocationKey(selection.locationKey);
  const { selector } = normalized;
  if (!selector.cityName) {
    return {
      projectId,
      selection: {
        countryCode: selector.countryCode,
        kind: "country" as const,
        languageCode: selector.languageCode,
      },
    };
  }
  return {
    projectId,
    selection: { canonicalKey: normalized.canonicalKey, kind: "city" as const },
  };
}

function uniqueWarnings(items: readonly { resolved: { warning: string | null } }[]) {
  return [
    ...new Set(items.flatMap((item) => (item.resolved.warning ? [item.resolved.warning] : []))),
  ];
}

export async function addKeywordsMatrix(input: unknown) {
  const data = parseActionInput(addKeywordsMatrixSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", data.projectId, { type: "keyword" });
  requireTrackedDomain(project);
  const schedule = data.schedule ? normalizeSchedule(data.schedule) : null;
  const keywords = uniqueKeywordTexts(data.keywords);
  const devices = [...new Set(data.devices)];
  const uniqueLocations = Array.from(
    new Map(data.locations.map((selection) => [matrixLocationKey(selection), selection])).values(),
  );
  const locations = await Promise.all(
    uniqueLocations.map(async (selection) => ({
      resolved: await resolveKeywordLocation(matrixSelectionInput(selection, project.id)),
      selection,
    })),
  );

  const result = await prisma.$transaction(async (tx) => {
    const rows = locations.flatMap(({ resolved }) =>
      devices.flatMap((device) =>
        keywords.map((keyword) => ({
          device,
          keyword,
          location: denormalizedLocationLabel(resolved.location),
          locationId: resolved.location.id,
          schedule,
          tags: data.tags,
          targetUrl: data.targetUrl,
          topic: data.topic,
          intent: data.intent,
        })),
      ),
    );
    const persisted = await createKeywordBatchSet(tx, project.id, rows);
    const canonicalKeys = new Map(
      locations.map(({ resolved }) => [resolved.location.id, resolved.location.canonicalKey]),
    );
    const promotedPairs = persisted.accepted.flatMap(({ keyword }) => {
      const key = canonicalKeys.get(keyword.locationId);
      return key ? promotedSavedKeywordPairs([keyword], key) : [];
    });
    const created: CreatedKeyword[] = persisted.created;
    const skippedDuplicates = rows.length - created.length;
    const [keywordCountRow] = await tx.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(DISTINCT lower(btrim("text")))::int AS "count"
      FROM "keywords"
      WHERE "projectId" = ${project.id}
    `;

    await writeAudit(
      {
        action: "keyword.matrix_add",
        actorId: actor.id,
        after: {
          keywordIds: created.map((keyword) => keyword.publicId),
          intent: data.intent ?? null,
          skippedDuplicates,
          tags: data.tags,
          targetUrl: data.targetUrl ?? null,
          topic: data.topic ?? null,
        },
        projectId: project.id,
        targetId: project.publicId,
        targetType: "project",
      },
      tx,
    );
    await consumeSavedKeywords(tx, project.id, data.consumeSavedIds, promotedPairs);
    return { created, keywordCount: keywordCountRow?.count ?? 0, skippedDuplicates };
  });

  revalidateKeywords();
  const warnings = uniqueWarnings(locations);
  return {
    created: result.created.length,
    keywordCount: result.keywordCount,
    keywords: result.created.map(publicKeywordView),
    skippedDuplicates: result.skippedDuplicates,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
