"use server";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { requireTrackedDomain } from "@/lib/projects/tracked-domain";
import { type AddKeywordsMatrixInput, addKeywordsMatrixSchema } from "@/lib/schemas/keyword";
import { countryCodeForMarketName, parseCanonicalKey } from "@/lib/serp/location";
import { resolveKeywordLocation } from "@/lib/serp/location-service";
import { normalizeSchedule } from "./_schedule";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";
import { uniqueKeywordTexts } from "./keyword-create";
import { createKeywordBatchSet, revalidateKeywords } from "./keyword-helpers";

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
  const selector = parseCanonicalKey(selection.locationKey);
  if (!selector) {
    throw new Error(`Unsupported location key: ${selection.locationKey}`);
  }
  if (!selector.cityName) {
    return {
      projectId,
      selection: { countryCode: selector.countryCode, kind: "country" as const },
    };
  }
  return {
    projectId,
    selection: { canonicalKey: selection.locationKey, kind: "city" as const },
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
          location: resolved.location.displayName,
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
    const created: CreatedKeyword[] = persisted.created;
    const skippedDuplicates = rows.length - created.length;

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
    return { created, skippedDuplicates };
  });

  revalidateKeywords();
  const warnings = uniqueWarnings(locations);
  return {
    created: result.created.length,
    keywords: result.created,
    skippedDuplicates: result.skippedDuplicates,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
