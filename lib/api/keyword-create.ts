import "server-only";

import { parseActionInput } from "@/lib/actions/_shared";
import { createKeywordBatchSet } from "@/lib/actions/keyword-helpers";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { MarketArchivedError } from "@/lib/markets/archived";
import { ProjectMarketLimitExceededError } from "@/lib/markets/limits";
import { projectDefaultSerpMarket } from "@/lib/serp/default-market";
import { resolveSerpLanguage } from "@/lib/serp/language-catalog";
import {
  canonicalKey,
  LocationInputError,
  type LocationSelection,
  normalizeCanonicalLocationKey,
} from "@/lib/serp/location";
import { denormalizedLocationLabel } from "@/lib/serp/location-label";
import { resolveKeywordLocation } from "@/lib/serp/location-service";
import { type ApiContext, forbidden, projectMatches } from "./context";
import { scheduleFromCreate } from "./keyword-utils";
import { legacyMarketLocationKey, legacyMarketLocationSelection } from "./legacy-market-input";
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

// Every create item ends as a location key; legacy names pass through the translator.
type CreateMarket = {
  device: "desktop" | "mobile";
  locationKey: string;
  selection: LocationSelection;
  source: "canonical" | "legacy";
};
type KeywordCreateTransaction = Pick<
  Prisma.TransactionClient,
  | "$executeRaw"
  | "$queryRaw"
  | "auditLog"
  | "keyword"
  | "keywordTag"
  | "keywordSchedule"
  | "projectMarket"
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

function defaultLocationKeyWithLanguage(locationKey: string, language: string | null | undefined) {
  if (!language) return locationKey;
  const languageCode = resolveSerpLanguage(language)?.code;
  if (!languageCode) {
    throw new LocationInputError("languageCode", `Unsupported language: ${language}`);
  }
  const { selector } = normalizeCanonicalLocationKey(locationKey);
  return canonicalKey({ ...selector, languageCode });
}

function createMarket(
  item: {
    city?: string | null;
    country?: string;
    device?: "desktop" | "mobile";
    language?: string | null;
    location?: string;
    location_key?: string;
  },
  defaults: Awaited<ReturnType<typeof loadCreateDefaultMarket>>,
): CreateMarket {
  const device = item.device ?? defaults.device;
  if (item.location_key) {
    return {
      device,
      locationKey: item.location_key,
      selection: { canonicalKey: item.location_key, kind: "city" },
      source: "canonical",
    };
  }
  const country = item.location ?? item.country;
  if (country) {
    const legacyInput = {
      city: item.city,
      country,
      language: item.language,
    };
    return {
      device,
      locationKey: legacyMarketLocationKey(legacyInput),
      selection: legacyMarketLocationSelection(legacyInput),
      source: "legacy",
    };
  }
  if (item.city) {
    const legacyInput = {
      city: item.city,
      country: defaults.country,
      language: item.language,
    };
    return {
      device,
      locationKey: legacyMarketLocationKey(legacyInput),
      selection: legacyMarketLocationSelection(legacyInput),
      source: "legacy",
    };
  }
  if (defaults.locationKey) {
    const locationKey = defaultLocationKeyWithLanguage(defaults.locationKey, item.language);
    return {
      device,
      locationKey,
      selection: { canonicalKey: locationKey, kind: "city" },
      source: "canonical",
    };
  }
  const legacyInput = {
    city: defaults.city,
    country: defaults.country,
    language: item.language,
  };
  return {
    device,
    locationKey: legacyMarketLocationKey(legacyInput),
    selection: legacyMarketLocationSelection(legacyInput),
    source: "legacy",
  };
}

function locationInput(market: CreateMarket, projectId: string) {
  return { projectId, selection: market.selection };
}

function marketKey(market: CreateMarket) {
  return `${market.source}\u0000${market.locationKey}`;
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
        location: denormalizedLocationLabel(resolved.location),
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
    if (error instanceof MarketArchivedError) {
      return errorResponse("conflict", error.message, 409, {
        headers: ctx.headers,
        instance: ctx.instance,
      });
    }
    if (
      !(error instanceof KeywordLimitExceededError) &&
      !(error instanceof ProjectMarketLimitExceededError)
    ) {
      throw error;
    }
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
