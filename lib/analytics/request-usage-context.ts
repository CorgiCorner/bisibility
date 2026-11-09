import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { classifyRequestUsage } from "./request-usage";
import { queueRequestUsageEvent, queueRequestUsageTask } from "./request-usage-delivery";

type PaidFeature =
  | "ai_visibility"
  | "ai_tracking"
  | "prompt_explorer"
  | "prompt_research"
  | "backlinks"
  | "domain_overview"
  | "keyword_metrics"
  | "keyword_research"
  | "local_scan"
  | "rank_check"
  | "ranked_keywords";
type Paid = { provider: "dataforseo" | "serpapi"; payment: "byok" | "credits" };
type Scope = { paid?: Paid };
const scopes = new AsyncLocalStorage<Scope>();
const freeScopes = new AsyncLocalStorage<{ provider?: "ahrefs" }>();

export async function withFreeRequestUsage<T>(
  input: {
    projectId: string;
    actorId?: string | null;
    operationKey: string;
    timestamp?: Date;
    resolveTimestamp?: () => Promise<Date | undefined>;
    trigger: "manual" | "scheduled" | "api" | "unknown";
    feature: "domain_rating";
  },
  operation: () => Promise<T>,
): Promise<T> {
  if (freeScopes.getStore()) return operation();
  const scope: { provider?: "ahrefs" } = {};
  return freeScopes.run(scope, async () => {
    let succeeded = false;
    try {
      const result = await operation();
      succeeded = !(result && typeof result === "object" && "ok" in result && result.ok === false);
      return result;
    } finally {
      if (succeeded && scope.provider)
        queueFreeProjectUsage({ ...input, provider: scope.provider });
    }
  });
}

/** Called immediately before a free provider's data request leaves the process. */
export function recordFreeUsage(provider: "ahrefs") {
  try {
    const scope = freeScopes.getStore();
    if (scope && !scope.provider) scope.provider = provider;
  } catch {
    /* Optional instrumentation cannot affect the provider. */
  }
}

export function queueFreeProjectUsage(input: {
  projectId: string;
  actorId?: string | null;
  operationKey: string;
  timestamp?: Date;
  resolveTimestamp?: () => Promise<Date | undefined>;
  provider: "ahrefs";
  feature: "domain_rating";
  trigger: "manual" | "scheduled" | "api" | "unknown";
}) {
  try {
    queueRequestUsageTask(async () => {
      const project = input.actorId
        ? null
        : await prisma.project.findFirst({
            where: { OR: [{ id: input.projectId }, { publicId: input.projectId }] },
            select: { ownerId: true },
          });
      const userId = input.actorId ?? project?.ownerId;
      if (!userId) return;
      queueRequestUsageEvent({
        operationKey: input.operationKey,
        userId,
        timestamp: input.timestamp ?? (await input.resolveTimestamp?.()),
        properties: { provider: input.provider, feature: input.feature, trigger: input.trigger },
      });
    });
  } catch {
    /* Analytics scheduling must not affect product work. */
  }
}

/** Aggregate measured native attempts within one service operation. */
export async function withRequestUsage<T>(
  input: {
    actorId?: string | null;
    projectId: string;
    source: string;
    feature: PaidFeature;
    operationKey?: string;
    timestamp?: Date;
  },
  operation: () => Promise<T>,
): Promise<T> {
  if (scopes.getStore()) return operation();
  const scope: Scope = {};
  const operationKey = input.operationKey ?? randomUUID();
  return scopes.run(scope, async () => {
    let succeeded = false;
    try {
      const result = await operation();
      succeeded = !(result && typeof result === "object" && "ok" in result && result.ok === false);
      return result;
    } finally {
      if (succeeded && scope.paid) {
        const paid = scope.paid;
        try {
          queueRequestUsageTask(async () => {
            const project = input.actorId
              ? null
              : await prisma.project.findFirst({
                  where: { OR: [{ id: input.projectId }, { publicId: input.projectId }] },
                  select: { ownerId: true },
                });
            const userId = input.actorId ?? project?.ownerId;
            if (!userId) return;
            queueRequestUsageEvent({
              operationKey: `paid/${operationKey}`,
              userId,
              timestamp: input.timestamp,
              properties: {
                ...paid,
                feature: input.feature,
                trigger: ["api", "mcp", "cli", "sdk"].includes(input.source)
                  ? "api"
                  : input.source === "app"
                    ? "manual"
                    : "unknown",
              },
            });
          });
        } catch {
          /* Scheduling analytics cannot affect the result. */
        }
      }
    }
  });
}

/** Called only after the accounting journal has retained measured native evidence. */
export function recordPaidUsage(input: {
  provider: string;
  payment: "byok" | "credits";
  costCents: number | null;
  quantity: number | null;
  failed?: boolean;
}) {
  try {
    const scope = scopes.getStore();
    if (!scope || scope.paid || (input.provider !== "dataforseo" && input.provider !== "serpapi"))
      return;
    if (classifyRequestUsage({ ...input, used: true, cached: false }) !== "paid_request_used")
      return;
    scope.paid = { provider: input.provider, payment: input.payment };
  } catch {
    /* Never affect paid execution. */
  }
}

/** Adapt service contexts to the same operation scope without repeating wrapper plumbing. */
export function withContextRequestUsage<
  Input extends { projectId: string; actorId?: string | null; origin: { source: string } },
  Rest extends unknown[],
  Result,
>(feature: PaidFeature, operation: (input: Input, ...rest: Rest) => Promise<Result>) {
  return (input: Input, ...rest: Rest) =>
    withRequestUsage(
      { projectId: input.projectId, actorId: input.actorId, source: input.origin.source, feature },
      () => operation(input, ...rest),
    );
}
