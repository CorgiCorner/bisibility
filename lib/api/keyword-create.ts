import "server-only";

import { parseActionInput } from "@/lib/actions/_shared";
import { createKeywordBatchSet } from "@/lib/actions/keyword-helpers";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { projectDefaultSerpMarket } from "@/lib/serp/default-market";
import { resolveKeywordLocation } from "@/lib/serp/location-service";
import { type ApiContext, forbidden, projectMatches } from "./context";
import { scheduleFromCreate } from "./keyword-utils";
import { KeywordLimitExceededError } from "./resource-limits";
import { keywordInclude, keywordResource } from "./resources";
import { errorResponse, resourceResponse } from "./responses";
import { keywordCreateItemSchema } from "./schemas";

export const KEYWORD_CREATE_TRANSACTION_TIMEOUT_MS = 10_000;

function normalizeCreateBody(body: unknown) {
  if (Array.isArray(body)) {
    return body;
  }
  if (
    body &&
    typeof body === "object" &&
    Array.isArray((body as { keywords?: unknown }).keywords)
  ) {
    return (body as { keywords: unknown[] }).keywords.map((item) =>
      typeof item === "string" ? { keyword: item } : item,
    );
  }

  return [body];
}

type CreateMarket = {
  city: string | null | undefined;
  country: string;
  device: "desktop" | "mobile";
  locationKey?: string | null;
};
type KeywordCreateTransaction = Pick<
  Prisma.TransactionClient,
  | "$executeRaw"
  | "$queryRaw"
  | "auditLog"
  | "keyword"
  | "keywordTag"
  | "keywordSchedule"
  | "projectDefaults"
  | "tag"
>;
type KeywordCreateClient =
  | KeywordCreateTransaction
  | (KeywordCreateTransaction & Pick<typeof prisma, "$transaction">);

async function loadCreateDefaultMarket(projectId: string, client: KeywordCreateClient) {
  const [defaults, keywords] = await Promise.all([
    client.projectDefaults.findUnique({ where: { projectId } }),
    client.keyword.findMany({
      select: { device: true, location: true, locationRef: true },
      where: { projectId },
    }),
  ]);
  return projectDefaultSerpMarket(defaults, keywords);
}

function createMarket(
  item: {
    city?: string | null;
    country?: string;
    device?: "desktop" | "mobile";
    location?: string;
    location_key?: string;
  },
  defaults: Awaited<ReturnType<typeof loadCreateDefaultMarket>>,
): CreateMarket {
  if (item.location_key) {
    return {
      city: item.city,
      country: item.location ?? item.country ?? defaults.country,
      device: item.device ?? defaults.device,
      locationKey: item.location_key,
    };
  }
  const country = item.location ?? item.country;
  if (country) {
    return { city: item.city, country, device: item.device ?? defaults.device };
  }
  return {
    city: defaults.city,
    country: defaults.country,
    device: item.device ?? defaults.device,
    locationKey: defaults.locationKey,
  };
}

function locationInput(market: CreateMarket, projectId: string) {
  return market.locationKey
    ? { projectId, selection: { canonicalKey: market.locationKey, kind: "city" as const } }
    : { city: market.city, country: market.country, projectId };
}

function marketKey(market: CreateMarket) {
  return [market.locationKey ?? "", market.country, market.city ?? ""].join("\u0000");
}

export async function createKeywords(
  ctx: ApiContext,
  projectId: string,
  client: KeywordCreateClient = prisma,
) {
  if (!projectMatches(ctx.auth, projectId)) {
    return forbidden(ctx, "API key is not scoped to this project.");
  }

  const body = await ctx.req.json();
  const items = parseActionInput(
    keywordCreateItemSchema.array().min(1).max(500),
    normalizeCreateBody(body),
  );
  const defaultMarket = await loadCreateDefaultMarket(ctx.auth.project.id, client);
  const warnings = new Set<string>();
  const preparedItems: Array<{
    item: (typeof items)[number];
    market: CreateMarket;
  }> = items.map((item) => {
    const market = createMarket(item, defaultMarket);
    return { item, market };
  });
  const uniqueMarkets = new Map(
    preparedItems.map(({ market }) => [marketKey(market), market] as const),
  );
  const resolvedMarkets = new Map(
    await Promise.all(
      [...uniqueMarkets].map(
        async ([key, market]) =>
          [key, await resolveKeywordLocation(locationInput(market, ctx.auth.project.id))] as const,
      ),
    ),
  );
  const resolvedItems = preparedItems.map(({ item, market }) => {
    const resolved = resolvedMarkets.get(marketKey(market));
    if (!resolved) throw new Error("Keyword location could not be resolved.");
    if (resolved.warning) warnings.add(resolved.warning);
    return { item, market, resolved };
  });

  const persist = async (tx: KeywordCreateTransaction) => {
    const persisted = await createKeywordBatchSet(
      tx,
      ctx.auth.project.id,
      resolvedItems.map(({ item, market, resolved }) => ({
        device: market.device,
        keyword: item.keyword,
        location: resolved.location.displayName,
        locationId: resolved.location.id,
        schedule: scheduleFromCreate(item),
        tags: item.tags,
        targetUrl: item.target_url ?? null,
        topic: item.topic ?? null,
        intent: item.intent ?? null,
      })),
    );
    const hydrated = await tx.keyword.findMany({
      include: keywordInclude,
      where: { id: { in: persisted.accepted.map(({ keyword }) => keyword.id) } },
    });
    const hydratedById = new Map(hydrated.map((keyword) => [keyword.id, keyword]));
    const results = persisted.accepted.map(({ created, keyword }, index) => {
      const stored = hydratedById.get(keyword.id);
      if (!stored) throw new Error("Keyword could not be created.");
      const warning = resolvedItems[index]?.resolved.warning;
      return {
        keyword: keywordResource(stored, ctx.auth.project.publicId),
        status: created ? "created" : "skipped",
        ...(warning ? { warning } : {}),
      };
    });
    const createdCount = persisted.created.length;
    const skippedCount = persisted.accepted.length - createdCount;

    await writeAudit(
      {
        action: "keyword.batch_add",
        actorId: null,
        after: { created: createdCount, skipped: skippedCount },
        projectId: ctx.auth.project.id,
        targetId: ctx.auth.project.publicId,
        targetType: "project",
      },
      tx,
    );
    return { createdCount, results, skippedCount };
  };

  let persisted: Awaited<ReturnType<typeof persist>>;
  try {
    // Only this REST-owned transaction sets a budget; TransactionClient callers keep their outer one.
    persisted =
      "$transaction" in client
        ? await client.$transaction((tx) => persist(tx), {
            timeout: KEYWORD_CREATE_TRANSACTION_TIMEOUT_MS,
          })
        : await persist(client);
  } catch (error) {
    if (!(error instanceof KeywordLimitExceededError)) throw error;
    return errorResponse("forbidden", error.message, 403, {
      headers: ctx.headers,
      instance: ctx.instance,
    });
  }

  const warningList = [...warnings];
  const responseBody = {
    created: persisted.createdCount,
    results: persisted.results,
    skipped: persisted.skippedCount,
    ...(warningList.length > 0 ? { warnings: warningList } : {}),
  };
  return resourceResponse(responseBody, {
    headers: ctx.headers,
    status: persisted.createdCount > 0 ? 201 : 200,
  });
}
