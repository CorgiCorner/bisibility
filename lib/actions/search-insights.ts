"use server";

import { prisma } from "@/lib/db/prisma";
import type { GooglePropertyOption } from "@/lib/integrations/types";
import {
  loadStoredGoogleProperties,
  saveStoredGoogleProperty,
} from "@/lib/providers/analytics/google-stored-property";
import { asProjectRef, searchConsolePath } from "@/lib/routing/app-path";
import { dateKey } from "@/lib/search-insights/dates";
import { searchInsightsPropertyKey } from "@/lib/search-insights/keys";
import type { SearchInsightsProperty } from "@/lib/search-insights/queries/context";
import {
  PROPERTY_KIND_LABELS,
  propertyDisplayName,
  searchInsightsProperty,
} from "@/lib/search-insights/queries/context-model";
import {
  getSearchInsightsQueryCsv,
  type SearchInsightsCsv,
} from "@/lib/search-insights/queries/query-export";
import { requestSearchInsightsSync } from "@/lib/search-insights/sync/sync-now";
import { transitionActiveSearchImport } from "@/lib/search-insights/sync/user-pause-control";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

const MODULE_ROUTE = searchConsolePath(asProjectRef("[project]"));
const SOURCE = "gsc";

const projectSchema = z.object({
  projectId: z.string().trim().min(1).max(120),
});
const selectPropertySchema = projectSchema.extend({
  property: z.string().trim().min(1).max(300),
});
const transitionSchema = projectSchema.extend({
  transition: z.enum(["pause", "resume", "retry"]),
});
const exportSchema = projectSchema.extend({
  period: z.string().trim().max(8).optional(),
});

export type SearchInsightsPropertyOption = SearchInsightsProperty & {
  permissionLevel: string;
};

export type ArchivedSearchInsightsProperty = SearchInsightsProperty & {
  lastSyncedDate: string;
};

export type SearchInsightsPropertiesResult = {
  archived: readonly ArchivedSearchInsightsProperty[];
  error?: string;
  properties: readonly SearchInsightsPropertyOption[];
  requiresReauth?: boolean;
  selected?: string;
};

// The stored option label already embeds the property type, and the picker renders that type as
// its own pill, so the option is rebuilt from `kind` instead of reusing the composed label.
function propertyOption(option: GooglePropertyOption): SearchInsightsPropertyOption {
  const kind = option.kind === "domain" ? "domain" : "url-prefix";
  return {
    displayName: propertyDisplayName(option.value),
    kind,
    kindLabel: PROPERTY_KIND_LABELS[kind],
    permissionLevel: option.permissionLevel,
    value: option.value,
  };
}

export async function loadSearchInsightsProperties(
  input: unknown,
): Promise<SearchInsightsPropertiesResult> {
  const data = parseActionInput(projectSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "provider_connection",
  });
  const setup = await loadStoredGoogleProperties({ projectId: project.id, provider: SOURCE });
  const activeProperty = setup.preferredProperty
    ? searchInsightsPropertyKey(setup.preferredProperty)
    : null;
  if (activeProperty) {
    await prisma.$transaction(async (tx) => {
      await tx.searchInsightsPropertyRegistry.updateMany({
        data: { archivedAt: new Date(), status: "archived" },
        where: { projectId: project.id, status: "active", propertyKey: { not: activeProperty } },
      });
      await tx.searchInsightsPropertyRegistry.upsert({
        create: { projectId: project.id, propertyKey: activeProperty, status: "active" },
        update: { archivedAt: null, status: "active" },
        where: { projectId_propertyKey: { projectId: project.id, propertyKey: activeProperty } },
      });
    });
  }
  const archivedRows = await prisma.searchInsightsPropertyRegistry.findMany({
    select: { propertyKey: true },
    where: { projectId: project.id, status: "archived" },
  });
  const archived = await Promise.all(
    archivedRows.map(async (row) => {
      const partition = await prisma.searchAnalyticsSyncPartition.findFirst({
        orderBy: { date: "desc" },
        select: { date: true },
        where: { projectId: project.id, property: row.propertyKey, source: SOURCE },
      });
      const property = searchInsightsProperty(row.propertyKey);
      return property && partition
        ? { ...property, lastSyncedDate: dateKey(partition.date) }
        : null;
    }),
  );
  return {
    archived: archived.filter((property) => property !== null),
    ...(setup.error ? { error: setup.error } : {}),
    properties: setup.properties.map((option) => propertyOption(option)),
    ...(setup.requiresReauth ? { requiresReauth: true } : {}),
    ...(setup.preferredProperty ? { selected: setup.preferredProperty } : {}),
  };
}

export async function selectSearchInsightsProperty(input: unknown) {
  const data = parseActionInput(selectPropertySchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "provider_connection",
  });
  const result = await saveStoredGoogleProperty({
    actorId: actor.id,
    projectId: project.id,
    property: data.property,
    provider: SOURCE,
  });
  revalidatePath(MODULE_ROUTE, "page");
  return result;
}

export async function syncSearchInsightsNow(input: unknown) {
  const data = parseActionInput(projectSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "project" });
  const result = await requestSearchInsightsSync({ actorId: actor.id, projectId: project.id });
  if (result.status === "started") revalidatePath(MODULE_ROUTE, "page");
  return result;
}

export type SearchImportActionResult = { ok: true; state: string } | { message: string; ok: false };

const transitionFailure = (transition: "pause" | "resume" | "retry") =>
  `Search data sync could not be ${transition === "retry" ? "retried" : `${transition}d`}. Refresh the page and try again.`;

async function runSearchImportTransition(
  input: unknown,
  expected: "pause" | "resume" | "retry",
): Promise<SearchImportActionResult> {
  const data = parseActionInput(transitionSchema, input);
  if (data.transition !== expected) return { message: transitionFailure(expected), ok: false };
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "project" });
  try {
    const result = await transitionActiveSearchImport({
      actorId: actor.id,
      projectId: project.id,
      projectPublicId: project.publicId,
      transition: expected,
    });
    if (!result.changed) return { message: transitionFailure(expected), ok: false };
    revalidatePath(MODULE_ROUTE, "page");
    return { ok: true, state: result.state };
  } catch (error) {
    console.error("[search-insights] import transition failed", {
      error,
      projectId: project.id,
      transition: expected,
    });
    return { message: transitionFailure(expected), ok: false };
  }
}

export async function pauseSearchInsightsImport(input: unknown) {
  return await runSearchImportTransition(input, "pause");
}
export async function resumeSearchInsightsImport(input: unknown) {
  return await runSearchImportTransition(input, "resume");
}
export async function retrySearchInsightsImport(input: unknown) {
  return await runSearchImportTransition(input, "retry");
}

export async function exportSearchInsightsCsv(input: unknown): Promise<SearchInsightsCsv> {
  const data = parseActionInput(exportSchema, input);
  return getSearchInsightsQueryCsv(data.projectId, data.period);
}

export type ExportSearchInsightsCsvAction = typeof exportSearchInsightsCsv;
export type LoadSearchInsightsPropertiesAction = typeof loadSearchInsightsProperties;
export type SelectSearchInsightsPropertyAction = typeof selectSearchInsightsProperty;
export type SyncSearchInsightsNowAction = typeof syncSearchInsightsNow;

export type SearchInsightsImportAction = typeof pauseSearchInsightsImport;
