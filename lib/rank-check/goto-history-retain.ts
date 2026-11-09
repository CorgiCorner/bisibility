import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { recoveryInstance } from "@/lib/metering/recovery/tokens";
import { meteringNamespace } from "@/lib/metering/runtime";
import { decryptSecret, encryptSecret } from "@/lib/providers/crypto";
import { dataForSeoRawPayload } from "@/lib/providers/serp/dataforseo-payload";
import type { OrganicResultDecision } from "@/lib/providers/serp/organic-result-decision";
import type { RedirectRowsResolution } from "@/lib/providers/serp/redirect-resolution";
import { CURRENT_RANK_NORMALIZATION_VERSION } from "@/lib/rank-check/normalization-version";
import { organicDomainRanksFromV2Results } from "@/lib/rank-check/organic-ranks";
import { rankRecoveryContext } from "@/lib/rank-check/recovery-context";
import { retainedRankResultEnvelopeV2 } from "@/lib/rank-check/recovery-evidence-envelope";
import { restoreRetainedRankResult } from "@/lib/rank-check/recovery-restore";
import { RESULT_PERSISTENCE_GRACE_MS } from "@/lib/rank-check/recovery-result-grace";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { resolveSerpDepth } from "@/lib/serp/constants";

const digest = (body: string) => createHash("sha256").update(body).digest("hex");

type LoadedCheck = NonNullable<
  Awaited<ReturnType<typeof import("./goto-history-preview").loadGotoHistoryCandidate>>
>["check"];

function attemptList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as { message?: unknown; provider?: unknown };
    return typeof record.provider === "string" && typeof record.message === "string"
      ? [{ message: record.message, provider: record.provider }]
      : [];
  });
}

export async function retainHistoricalGotoResult(
  tx: Prisma.TransactionClient,
  check: LoadedCheck,
  decided: {
    decision: Exclude<OrganicResultDecision, { outcome: "indeterminate" }>;
    providerResponse?: unknown;
    resolution: RedirectRowsResolution<unknown>;
  },
  now: Date,
) {
  const keyword = check.keyword;
  const contextHash = check.queuedTask?.recoveryContextHash;
  if (historicalScopeReason(check)) return false;
  const depth = resolveSerpDepth(check.requestedDepth ?? undefined);
  const finishedAt = (check.preRecoveryFinishedAt ?? check.finishedAt ?? now).toISOString();
  const raw = {
    ...dataForSeoRawPayload(
      decided.resolution.candidates,
      decided.decision,
      decided.providerResponse,
    ),
    ...(decided.resolution.resolutions.some((row) => row.status !== "not_redirect")
      ? { redirect_resolutions: decided.resolution.resolutions }
      : {}),
  };
  const returnedDepth = decided.decision.organicResults.reduce(
    (max, item) => Math.max(max, item.rank),
    0,
  );
  const value = retainedRankResultEnvelopeV2.parse({
    completeness: "complete",
    contextHash,
    finishedAt,
    historicalRepair: true,
    returnedDepth,
    target: {
      attempts: attemptList(check.attempts),
      expectedUrlAtCheck: check.expectedUrlAtCheck,
      keywordId: keyword.id,
      projectId: keyword.project.id,
      queuedTaskId: check.queuedTask?.id ?? null,
    },
    result: {
      comparisonAllowed: false,
      rankCheck: {
        billingUnits: null,
        checkedAt: check.checkedAt.toISOString(),
        costCents: null,
        estimatedCostCents: null,
        keywordId: keyword.id,
        normalizationVersion: CURRENT_RANK_NORMALIZATION_VERSION,
        organicRanks: organicDomainRanksFromV2Results(decided.decision.organicResults),
        position: decided.decision.position,
        previousPosition: null,
        provider: "dataforseo",
        rankingUrl: decided.decision.rankingUrl,
        raw,
        requestedDepth: depth,
      },
    },
    version: 2,
  });
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body) > 4 * 1024 * 1024) return false;
  const createdAt = new Date(now.getTime() - RESULT_PERSISTENCE_GRACE_MS - 1000);
  await tx.rankCheckResultEvidence.upsert({
    where: { rankCheckId: check.id },
    create: {
      createdAt,
      expiresAt: new Date(now.getTime() + 7 * 86_400_000),
      identityHash: digest(body),
      instanceId: recoveryInstance(),
      namespace: meteringNamespace(),
      payloadEncrypted: encryptSecret(body),
      rankCheckId: check.id,
      schemaVersion: 2,
    },
    update: {
      blockedCode: null,
      createdAt,
      expiresAt: new Date(now.getTime() + 7 * 86_400_000),
      identityHash: digest(body),
      payloadEncrypted: encryptSecret(body),
      schemaVersion: 2,
    },
  });
  return restoreRetainedRankResult(tx, check.id, null, now);
}

export function historicalPartialId(checkId: string) {
  return digest(
    JSON.stringify(["goto-history-partial", meteringNamespace(), recoveryInstance(), checkId]),
  );
}

export function historicalScopeReason(check: LoadedCheck) {
  const originalHash = check.queuedTask?.recoveryContextHash;
  if (!originalHash) return "scope_unproven" as const;
  const keyword = check.keyword;
  const currentHash = rankRecoveryContext(
    {
      device: keyword.device,
      domain: trackedProjectDomain(keyword.project.domain) ?? "",
      location: keyword.locationRef,
      revision: keyword.updatedAt,
      text: keyword.text,
    },
    resolveSerpDepth(check.requestedDepth ?? undefined),
  );
  return originalHash === currentHash ? null : ("scope_changed" as const);
}

export async function rememberedPartial(checkId: string) {
  const row = await prisma.providerPartialEvidence.findUnique({
    where: { id: historicalPartialId(checkId) },
  });
  if (!row) return undefined;
  try {
    const parsed = JSON.parse(decryptSecret(row.payloadEncrypted)) as {
      outcome?: string;
      taskId?: string | null;
      version?: number;
    };
    return parsed.version === 2 && parsed.outcome === "indeterminate"
      ? (parsed.taskId ?? null)
      : undefined;
  } catch {
    return undefined;
  }
}

export async function readStoredSource(checkId: string, now: Date) {
  const rows = await prisma.providerPartialEvidence.findMany({
    orderBy: { schemaVersion: "desc" },
    select: { payloadEncrypted: true, schemaVersion: true },
    where: { expiresAt: { gt: now }, rankCheckId: checkId, schemaVersion: { in: [2, 3] } },
  });
  for (const row of rows) {
    try {
      const parsed = JSON.parse(decryptSecret(row.payloadEncrypted)) as { data?: unknown };
      if (row.schemaVersion === 3 && parsed && typeof parsed === "object" && "data" in parsed)
        return parsed.data;
      if (
        row.schemaVersion === 2 &&
        parsed &&
        typeof parsed === "object" &&
        ("tasks" in parsed || "task" in parsed || "data" in parsed)
      )
        return parsed;
    } catch {
      // An unreadable row is not a source. The task id can still be fetched.
    }
  }
  return null;
}

export async function rememberPartial(
  tx: Prisma.TransactionClient,
  checkId: string,
  taskId: string | null,
  now: Date,
) {
  const body = JSON.stringify({ outcome: "indeterminate", taskId, version: 2 });
  const id = historicalPartialId(checkId);
  await tx.providerPartialEvidence.upsert({
    where: { id },
    create: {
      expiresAt: new Date(now.getTime() + 7 * 86_400_000),
      id,
      identityHash: createHash("sha256").update(body).digest("hex"),
      instanceId: recoveryInstance(),
      kind: "unresolved",
      namespace: meteringNamespace(),
      payloadEncrypted: encryptSecret(body),
      rankCheckId: checkId,
      schemaVersion: 2,
    },
    update: {
      identityHash: createHash("sha256").update(body).digest("hex"),
      payloadEncrypted: encryptSecret(body),
    },
  });
}
