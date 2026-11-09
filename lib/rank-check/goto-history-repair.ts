import "server-only";
import { prisma } from "@/lib/db/prisma";
import { recoverySwitches } from "@/lib/provider-evidence/recovery/switches";
import { decryptProviderCredentials } from "@/lib/providers/crypto";
import { fetchDataForSeoQueuedResult } from "@/lib/providers/serp/dataforseo-queued";
import { dataForSeoRedirectTransport } from "@/lib/providers/serp/dataforseo-redirect-transport";
import type { ProviderCredentials } from "@/lib/providers/types";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { loadGotoHistoryCandidate, previewGotoHistory } from "./goto-history-preview";
import {
  historicalScopeReason,
  readStoredSource,
  rememberedPartial,
  rememberPartial,
  retainHistoricalGotoResult,
} from "./goto-history-retain";
import { decideGotoHistoryBody, withGuardedFetch } from "./goto-history-source";

export type GotoHistoryRepairCounts = {
  eligible: number;
  examined: number;
  failed: number;
  failureReasons: ReturnType<typeof failureCounts>;
  skipReasons: ReturnType<typeof skipCounts>;
  mode: "apply" | "dry-run" | "inactive";
  providerCalls: number;
  requalified: number;
  restored: number;
  skipped: number;
  truncated: number;
  unchanged: number;
  writes: number;
};

const failureCounts = () => ({
  row_error: 0,
  source_lookup_failed: 0,
  source_status: 0,
  conversion_failed: 0,
});
const skipCounts = () => ({
  ineligible: 0,
  scope_unproven: 0,
  scope_changed: 0,
  credentials_unavailable: 0,
  domain_unavailable: 0,
  source_identity: 0,
  source_incomplete: 0,
  restore_rejected: 0,
});
type RowOutcome =
  | "restored"
  | "requalified"
  | "unchanged"
  | keyof ReturnType<typeof failureCounts>
  | keyof ReturnType<typeof skipCounts>;

const empty = (mode: GotoHistoryRepairCounts["mode"]): GotoHistoryRepairCounts => ({
  eligible: 0,
  examined: 0,
  failed: 0,
  failureReasons: failureCounts(),
  skipReasons: skipCounts(),
  mode,
  providerCalls: 0,
  requalified: 0,
  restored: 0,
  skipped: 0,
  truncated: 0,
  unchanged: 0,
  writes: 0,
});

export type GotoHistoryRepairOptions = {
  apply?: boolean;
  checkIds?: readonly string[];
  fetch?: typeof fetch;
  limit: number;
  now?: Date;
  resolveCredentials?: (connectionId: string) => Promise<ProviderCredentials | null>;
};

function assertLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Limit must be an integer from 1 to 100.");
}

async function storedCredentials(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({
    select: { credentialsEncrypted: true },
    where: { id: connectionId },
  });
  const stored = decryptProviderCredentials(connection?.credentialsEncrypted);
  return stored.login && stored.password ? stored : null;
}

export async function repairGotoHistory(
  options: GotoHistoryRepairOptions,
): Promise<GotoHistoryRepairCounts> {
  assertLimit(options.limit);
  const now = options.now ?? new Date();
  const switches = recoverySwitches();
  if (!switches.lookup) return empty("inactive");
  const preview = await previewGotoHistory({
    checkIds: options.checkIds,
    limit: options.limit,
    now,
  });
  const eligible = preview.rows.filter((row) => row.classification.startsWith("eligible"));
  const base = {
    eligible: eligible.length,
    examined: preview.examined,
    failed: 0,
    failureReasons: failureCounts(),
    skipReasons: {
      ...skipCounts(),
      ineligible: preview.examined - eligible.length - preview.truncated,
    },
    providerCalls: 0,
    requalified: 0,
    restored: 0,
    skipped: preview.examined - eligible.length - preview.truncated,
    truncated: preview.truncated,
    unchanged: 0,
    writes: 0,
  };
  if (!options.apply || !switches.restore) return { ...base, mode: "dry-run" };
  let providerCalls = 0;
  const baseFetch = options.fetch ?? globalThis.fetch;
  const fetchImpl: typeof fetch = async (input, init) => {
    providerCalls += 1;
    return baseFetch(input, init);
  };
  const resolveCredentials = options.resolveCredentials ?? storedCredentials;
  let restored = 0;
  let requalified = 0;
  let unchanged = 0;
  let skipped = base.skipped;
  let failed = 0;
  const failureReasons = failureCounts();
  const skipReasons = { ...skipCounts(), ineligible: base.skipped };
  for (const row of eligible) {
    const outcome = await repairOne(row.checkId, now, fetchImpl, resolveCredentials).catch(
      () => "row_error" as const,
    );
    if (outcome === "restored") restored += 1;
    else if (outcome === "requalified") requalified += 1;
    else if (outcome === "unchanged") unchanged += 1;
    else if (
      outcome === "row_error" ||
      outcome === "source_lookup_failed" ||
      outcome === "source_status" ||
      outcome === "conversion_failed"
    ) {
      failed += 1;
      failureReasons[outcome] += 1;
    } else {
      skipped += 1;
      skipReasons[outcome] += 1;
    }
  }
  return {
    ...base,
    mode: "apply",
    failed,
    failureReasons,
    skipReasons,
    providerCalls,
    requalified,
    restored,
    skipped,
    unchanged,
    writes: restored + requalified,
  };
}

function decisionBound(check: {
  checkedAt: Date;
  finishedAt: Date | null;
  keyword: {
    device: string;
    locationRef: { id: string; languageCode: string | null };
    project: { domain: string | null };
    text: string;
    updatedAt: Date;
  };
  queuedTask: {
    id: string;
    providerTaskId: string | null;
    recoveryContextHash: string | null;
  } | null;
  requestedDepth: number | null;
}) {
  return JSON.stringify([
    check.checkedAt.toISOString(),
    check.finishedAt?.toISOString() ?? null,
    check.keyword.device,
    check.keyword.locationRef.id,
    check.keyword.locationRef.languageCode,
    check.keyword.project.domain,
    check.keyword.text,
    check.keyword.updatedAt.toISOString(),
    check.queuedTask?.id ?? null,
    check.queuedTask?.providerTaskId ?? null,
    check.queuedTask?.recoveryContextHash ?? null,
    check.requestedDepth,
  ]);
}

async function repairOne(
  checkId: string,
  now: Date,
  fetchImpl: typeof fetch,
  resolveCredentials: (connectionId: string) => Promise<ProviderCredentials | null>,
): Promise<RowOutcome> {
  const loaded = await loadGotoHistoryCandidate(prisma, checkId, now);
  if (!loaded) return "ineligible";
  if (!loaded.classification.startsWith("eligible") || !loaded.check.finishedAt)
    return "ineligible";
  const scopeReason = historicalScopeReason(loaded.check);
  if (scopeReason) return scopeReason;
  const bound = decisionBound(loaded.check);
  const taskId = loaded.check.queuedTask?.providerTaskId ?? null;
  const remembered = await rememberedPartial(checkId);
  if (
    remembered !== undefined &&
    remembered === taskId &&
    loaded.classification !== "eligible_retained"
  )
    return "unchanged";
  const connectionId = loaded.candidate.connectionId;
  const credentials = connectionId ? await resolveCredentials(connectionId) : null;
  if (!credentials?.login || !credentials.password) return "credentials_unavailable";
  const domain = trackedProjectDomain(loaded.check.keyword.project.domain);
  if (!domain) return "domain_unavailable";
  const depth = resolveSerpDepth(loaded.check.requestedDepth ?? undefined);
  const decided = await withGuardedFetch(fetchImpl, async () => {
    const stored = await readStoredSource(checkId, now);
    const body =
      stored ??
      (taskId ? await fetchDataForSeoQueuedResult(credentials, taskId).catch(() => null) : null);
    if (!body) return null;
    const result = await decideGotoHistoryBody({
      body,
      depth,
      domain,
      expectedTaskId: taskId,
      transport: dataForSeoRedirectTransport(credentials, 15_000),
    });
    return {
      ...result,
      providerResponse:
        typeof body === "object" && body !== null && "tasks" in body ? body : undefined,
    };
  });
  if (!decided) return "source_lookup_failed";
  if (decided.reason && decided.reason !== "indeterminate") return decided.reason;
  return prisma.$transaction(
    async (tx) => {
      const current = await loadGotoHistoryCandidate(tx, checkId, now);
      if (!current) return "ineligible";
      if (!current.classification.startsWith("eligible"))
        return current.check.status === "completed" ? "unchanged" : "ineligible";
      const scopeReason = historicalScopeReason(current.check);
      if (scopeReason) return scopeReason;
      if (decisionBound(current.check) !== bound) return "scope_changed";
      if (
        !decided.decision ||
        !decided.resolution ||
        !decided.complete ||
        decided.decision.outcome === "indeterminate"
      ) {
        if (decided.decision?.outcome === "indeterminate") {
          await rememberPartial(tx, checkId, taskId, now);
          return "requalified";
        }
        return "ineligible";
      }
      const restored = await retainHistoricalGotoResult(
        tx,
        current.check,
        {
          decision: decided.decision,
          resolution: decided.resolution,
          providerResponse: decided.providerResponse,
        },
        now,
      );
      return restored ? "restored" : "restore_rejected";
    },
    { timeout: 30_000 },
  );
}
