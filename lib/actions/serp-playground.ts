"use server";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { isOperationAccessDeniedError } from "@/lib/operations/access-error";
import { parseComparisonSnapshot } from "@/lib/provider-comparison/model";
import { readPlaygroundCache } from "@/lib/provider-comparison/playground-cache";
import {
  type PlaygroundPageData,
  playgroundInputSchema,
} from "@/lib/provider-comparison/playground-model";
import {
  previewPlaygroundSave,
  savePlaygroundResult,
} from "@/lib/provider-comparison/playground-save";
import {
  launchPlaygroundComparison,
  previewPlaygroundComparison,
} from "@/lib/provider-comparison/playground-service";
import {
  comparisonRunView,
  readPlaygroundRaw,
  readProviderComparison,
} from "@/lib/provider-comparison/read";
import { comparisonProviders } from "@/lib/provider-comparison/types";
import { type LocationSelection, normalizeCanonicalLocationKey } from "@/lib/serp/location";
import { resolveKeywordLocation } from "@/lib/serp/location-service";
import { z } from "zod";
import { getActionActor, requireProjectScope } from "./_shared";

const projectRefSchema = z.string().refine((value) => isPublicIdOfType(value, "prj"));
async function scope(projectRef: string, write = false) {
  projectRefSchema.parse(projectRef);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, write ? "update" : "read", projectRef, {
    type: "keyword",
  });
  return { actor, project };
}

export async function getSerpPlaygroundPage(projectRef: string): Promise<PlaygroundPageData> {
  const { actor, project } = await scope(projectRef);
  const [connections, market, runs] = await Promise.all([
    prisma.providerConnection.findMany({
      where: { projectId: project.id, provider: { in: [...comparisonProviders] } },
      select: {
        provider: true,
        enabled: true,
        status: true,
        credentialSource: true,
        credentialsEncrypted: true,
      },
    }),
    prisma.projectMarket.findFirst({
      where: { projectId: project.id, status: "active" },
      orderBy: { createdAt: "asc" },
      include: { location: true },
    }),
    prisma.providerComparisonRun.findMany({
      where: { projectId: project.id, keywordId: null },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { sides: true },
    }),
  ]);
  const location = market?.location;
  return {
    canRun: canProjectAction(getProjectRole(actor, project.id), "create", "keyword"),
    providers: comparisonProviders.map((provider) => {
      const connection = connections.find((item) => item.provider === provider);
      return {
        provider,
        selectedByDefault: Boolean(connection?.enabled),
        ready: Boolean(
          connection?.status === "connected" &&
            (connection.credentialSource === "hosted" || connection.credentialsEncrypted),
        ),
      };
    }),
    location: location
      ? {
          kind: location.kind,
          canonicalKey: location.canonicalKey,
          countryCode: location.countryCode,
          displayName: location.displayName,
          languageCode: location.languageCode,
          languageLabel: location.languageLabel,
        }
      : {
          kind: "country",
          canonicalKey: "US",
          countryCode: "US",
          displayName: "United States",
          languageCode: "en",
          languageLabel: "English",
        },
    history: runs.flatMap((run) => {
      try {
        return parseComparisonSnapshot(run.snapshot).version === 2 ? [comparisonRunView(run)] : [];
      } catch {
        return [];
      }
    }),
  };
}

export async function previewSerpPlaygroundAction(input: unknown) {
  try {
    const value = playgroundInputSchema
      .extend({ projectRef: projectRefSchema, fresh: z.boolean().optional() })
      .strict()
      .parse(input);
    const { actor, project } = await scope(value.projectRef, true);
    const key = normalizeCanonicalLocationKey(value.locationKey);
    const selection: LocationSelection = key.selector.cityName
      ? { kind: "city", canonicalKey: key.canonicalKey }
      : key.selector.regionName || key.selector.regionCode
        ? { kind: "region", canonicalKey: key.canonicalKey }
        : { kind: "country", canonicalKey: key.canonicalKey };
    const resolved = await resolveKeywordLocation({ projectId: project.id, selection });
    if (resolved.degraded) return { ok: false as const, reason: "location" as const };
    if (!value.fresh) {
      const cached = await readPlaygroundCache(project.id, {
        depth: value.depth,
        query: value.query,
        device: value.device,
        locationId: resolved.location.id,
        providers: value.providers,
      });
      if (cached) return { ok: true as const, cached };
    }
    const preview = await previewPlaygroundComparison({
      projectId: project.id,
      actorId: actor.id,
      search: {
        depth: value.depth,
        query: value.query,
        device: value.device,
        locationId: resolved.location.id,
        providers: value.providers,
      },
    });
    return { ok: true as const, preview };
  } catch (error) {
    return {
      ok: false as const,
      reason: isOperationAccessDeniedError(error) ? ("access" as const) : ("unavailable" as const),
    };
  }
}
const launchSchema = z
  .object({
    projectRef: projectRefSchema,
    previewId: z.uuid(),
    previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    requestKey: z.uuid(),
  })
  .strict();
export async function launchSerpPlaygroundAction(input: unknown) {
  try {
    const value = launchSchema.parse(input);
    const { actor, project } = await scope(value.projectRef, true);
    const run = await launchPlaygroundComparison(
      {
        ...value,
        projectId: project.id,
        actorId: actor.id,
      },
      () => recordAppAction(actor),
    );
    return { ok: true as const, run };
  } catch {
    return { ok: false as const };
  }
}
export async function readSerpPlaygroundAction(input: unknown) {
  try {
    const value = z.object({ projectRef: projectRefSchema, runId: z.uuid() }).strict().parse(input);
    const { actor, project } = await scope(value.projectRef);
    const run = await readProviderComparison({
      projectId: project.id,
      actorId: actor.id,
      runId: value.runId,
    });
    return run?.keyword.id === "" ? { ok: true as const, run } : { ok: false as const };
  } catch {
    return { ok: false as const };
  }
}

const saveSchema = z
  .object({ projectRef: projectRefSchema, runId: z.uuid(), provider: z.enum(comparisonProviders) })
  .strict();
export async function previewSerpPlaygroundSaveAction(input: unknown) {
  try {
    const value = saveSchema.parse(input);
    const { actor, project } = await scope(value.projectRef, true);
    return {
      ok: true as const,
      match: await previewPlaygroundSave({ ...value, projectId: project.id, actorId: actor.id }),
    };
  } catch {
    return { ok: false as const };
  }
}
export async function saveSerpPlaygroundAction(input: unknown) {
  try {
    const value = saveSchema.parse(input);
    const { actor, project } = await scope(value.projectRef, true);
    const result = await savePlaygroundResult(
      {
        ...value,
        projectId: project.id,
        actorId: actor.id,
      },
      () => recordAppAction(actor),
    );
    return { ok: true as const, ...result };
  } catch {
    return { ok: false as const };
  }
}

export async function getSerpPlaygroundRawAction(input: unknown) {
  try {
    const value = saveSchema.parse(input);
    const { actor, project } = await scope(value.projectRef);
    return {
      ok: true as const,
      response: await readPlaygroundRaw({ ...value, projectId: project.id, actorId: actor.id }),
    };
  } catch {
    return { ok: false as const };
  }
}
