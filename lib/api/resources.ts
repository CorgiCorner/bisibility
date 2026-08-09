import { whereExecutedChecks } from "@/lib/checks/status";
import type { Prisma } from "@/lib/generated/prisma/client";
import { resolveEffectiveSchedule } from "@/lib/keywords/effective-schedule";
import { tierFromScopes } from "./key-scope";
import { requireApiPublicId } from "./public-id";

export const keywordInclude = {
  project: { select: { defaults: true } },
  rankChecks: {
    orderBy: { checkedAt: "desc" },
    take: 1,
    where: whereExecutedChecks(),
  },
  schedule: true,
  tags: { include: { tag: true } },
} satisfies Prisma.KeywordInclude;

export const rankCheckSelect = {
  attempts: true,
  checkedAt: true,
  costCents: true,
  id: true,
  publicId: true,
  keyword: { select: { projectId: true, publicId: true } },
  position: true,
  previousPosition: true,
  provider: true,
  rankingUrl: true,
  raw: true,
  error: true,
  status: true,
} satisfies Prisma.RankCheckSelect;

export const RANK_CHECK_COMPLETED_STATUS = "completed";
export const RANK_CHECK_FAILED_STATUS = "failed";
export const RANK_CHECK_RUNNING_STATUS = "running";

export type ProjectLike = {
  createdAt: Date;
  domain: string | null;
  id: string;
  name: string;
  publicId: string;
  updatedAt: Date;
  writeMode?: string;
};

export type KeywordRecord = Prisma.KeywordGetPayload<{ include: typeof keywordInclude }>;
export type RankCheckRecord = Prisma.RankCheckGetPayload<{ select: typeof rankCheckSelect }>;

function apiRankCheckStatus(status: string) {
  if (
    status === RANK_CHECK_COMPLETED_STATUS ||
    status === RANK_CHECK_FAILED_STATUS ||
    status === RANK_CHECK_RUNNING_STATUS
  ) {
    return status;
  }
  throw new Error("Rank check status is not API-visible.");
}

function iso(date: Date | null | undefined) {
  return date ? date.toISOString() : null;
}

function decimalNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function rankCheckAttempts(value: Prisma.JsonValue | null) {
  if (!Array.isArray(value)) {
    return null;
  }

  const attempts = value.flatMap((attempt) => {
    if (
      !attempt ||
      typeof attempt !== "object" ||
      Array.isArray(attempt) ||
      typeof attempt.provider !== "string" ||
      typeof attempt.message !== "string"
    ) {
      return [];
    }

    return [{ message: attempt.message, provider: attempt.provider }];
  });

  return attempts.length > 0 ? attempts : null;
}

export function projectResource(project: ProjectLike) {
  return {
    created_at: project.createdAt.toISOString(),
    domain: project.domain ?? "",
    id: requireApiPublicId(project.publicId, "prj"),
    name: project.name,
    updated_at: project.updatedAt.toISOString(),
    write_mode: project.writeMode ?? "active",
  };
}

export function apiKeyResource(apiKey: {
  createdAt: Date;
  expiresAt: Date | null;
  id: string;
  lastUsedAt: Date | null;
  name: string;
  prefix: string;
  publicId: string | null;
  revokedAt: Date | null;
  scopes: readonly string[];
}) {
  return {
    created_at: apiKey.createdAt.toISOString(),
    expires_at: iso(apiKey.expiresAt),
    id: requireApiPublicId(apiKey.publicId ?? "", "key"),
    last_used_at: iso(apiKey.lastUsedAt),
    name: apiKey.name,
    prefix: apiKey.prefix,
    revoked_at: iso(apiKey.revokedAt),
    scope: tierFromScopes(apiKey.scopes),
  };
}

export function personalTokenResource(token: {
  createdAt: Date;
  expiresAt: Date | null;
  id: string;
  lastUsedAt: Date | null;
  name: string;
  prefix: string;
  publicId: string | null;
  revokedAt: Date | null;
  scopes: readonly string[];
}) {
  const scope = token.scopes.includes("admin")
    ? "admin"
    : token.scopes.includes("write")
      ? "write"
      : "read";
  return {
    created_at: token.createdAt.toISOString(),
    expires_at: iso(token.expiresAt),
    id: requireApiPublicId(token.publicId ?? "", "pat"),
    last_used_at: iso(token.lastUsedAt),
    name: token.name,
    prefix: token.prefix,
    revoked_at: iso(token.revokedAt),
    scope,
  };
}

// hmacSecret is deliberately absent: it is write-only after creation.
export function webhookEndpointResource(endpoint: {
  createdAt: Date;
  description: string | null;
  enabled: boolean;
  id: string;
  lastDeliveryAt: Date | null;
  updatedAt: Date;
  url: string;
  publicId: string | null;
}) {
  return {
    created_at: endpoint.createdAt.toISOString(),
    description: endpoint.description,
    enabled: endpoint.enabled,
    id: requireApiPublicId(endpoint.publicId ?? "", "we"),
    last_delivery_at: iso(endpoint.lastDeliveryAt),
    updated_at: endpoint.updatedAt.toISOString(),
    url: endpoint.url,
  };
}

export function keywordResource(keyword: KeywordRecord, projectPublicId: string) {
  const latest = keyword.rankChecks[0];
  const defaults = keyword.project?.defaults ?? null;
  const schedule = keyword.schedule ?? defaults;
  const effective = schedule
    ? resolveEffectiveSchedule(keyword.schedule, defaults, keyword.id)
    : null;
  return {
    country: keyword.location,
    created_at: keyword.createdAt.toISOString(),
    device: keyword.device,
    id: requireApiPublicId(keyword.publicId, "kw"),
    intent: keyword.intent,
    latest_position: latest?.position ?? null,
    location: keyword.location,
    previous_position: latest?.previousPosition ?? null,
    project_id: requireApiPublicId(projectPublicId, "prj"),
    ranking_url: latest?.rankingUrl ?? null,
    schedule: schedule
      ? {
          cron_expression: schedule.cronExpression,
          frequency: schedule.frequency,
          jitter_minutes: schedule.jitterMinutes,
          last_checked_at: iso(schedule.lastCheckedAt),
          next_check_at: iso(effective?.nextCheckAt),
          timezone: schedule.timezone,
        }
      : null,
    tags: keyword.tags.map((item) => item.tag.name),
    target_url: keyword.targetUrl,
    text: keyword.text,
    topic: keyword.topic,
    updated_at: keyword.updatedAt.toISOString(),
  };
}

export function rankCheckResource(check: RankCheckRecord) {
  const failed = check.status === RANK_CHECK_FAILED_STATUS;
  return {
    attempts: rankCheckAttempts(check.attempts),
    checked_at: check.checkedAt.toISOString(),
    cost_cents: decimalNumber(check.costCents),
    error: failed ? (check.error ?? "Rank check failed.") : null,
    id: requireApiPublicId(check.publicId, "check"),
    keyword_id: requireApiPublicId(check.keyword.publicId, "kw"),
    position: check.position,
    previous_position: check.previousPosition,
    provider: check.provider,
    ranking_url: check.rankingUrl,
    status: apiRankCheckStatus(check.status),
  };
}
