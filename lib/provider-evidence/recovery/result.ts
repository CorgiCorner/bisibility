import { matchesOriginalRecoveryAccount } from "./proof-extension";
import { recoverySwitches } from "./switches";
import "server-only";
import { createHash } from "node:crypto";
import type { Prisma, ProviderDispatchIdentity } from "@/lib/generated/prisma/client";
import { encryptSecret } from "@/lib/providers/crypto";
import {
  decideOrganicResult,
  organicResultNormalization,
} from "@/lib/providers/serp/organic-result-decision";
import { CURRENT_RANK_NORMALIZATION_VERSION } from "@/lib/rank-check/normalization-version";
import { rankRecoveryContext } from "@/lib/rank-check/recovery-context";
import { retainedRankResultEnvelopeV2 } from "@/lib/rank-check/recovery-evidence-envelope";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { resolveSerpDepth } from "@/lib/serp/constants";
import type { RecoveryLookup } from "./proof-value";
import { retainedSubmission } from "./submission";

const digest = (body: string) => createHash("sha256").update(body).digest("hex");
/** Called while the original check is locked. Acquisition is independent of proof imports. */
export async function captureRecoveryResult(
  tx: Prisma.TransactionClient,
  identity: ProviderDispatchIdentity,
  attemptId: string,
  outcome: RecoveryLookup,
  now: Date,
  applyPartial = false,
) {
  if (!recoverySwitches().lookup) return "lookup_disabled";
  if (!recoverySwitches().restore) return "restore_disabled";
  if (outcome.kind !== "evidence" || outcome.topStatus.code !== 20000 || outcome.tasks.length !== 1)
    return "result_unavailable";
  const source = outcome.proofSource;
  if (
    !source ||
    source.credentialVersion !== identity.providerCredentialVersion ||
    (identity.payerKind === "byok"
      ? source.accountId !== identity.payerAccountRef ||
        identity.payerAccountRef !== identity.connectionId
      : identity.payerKind !== "hosted" ||
        !(await matchesOriginalRecoveryAccount(tx, identity, source.accountId)))
  )
    return "result_account_conflict";
  const task = outcome.tasks[0];
  const check = await tx.rankCheck.findUnique({
    where: { id: identity.rankCheckId },
    include: { keyword: { include: { locationRef: true, project: true } } },
  });
  if (!check || check.status === "completed") return "accounting_only";
  const retained = retainedSubmission(identity, now);
  if (retained.kind !== "retained") return retained.reason;
  const payload = retained.submission.payload;
  const keyword = check.keyword;
  const depth = resolveSerpDepth(check.requestedDepth ?? undefined);
  const domain = trackedProjectDomain(keyword.project.domain) ?? "";
  const targets = payload.stop_crawl_on_match;
  const target = Array.isArray(targets) && targets.length === 1 ? targets[0] : null;
  const originalDomain =
    target && typeof target === "object" && target.match_type === "with_subdomains"
      ? target.match_value
      : null;
  if (
    identity.keywordId !== check.keywordId ||
    identity.keywordRevision.getTime() !== keyword.updatedAt.getTime() ||
    payload.keyword !== keyword.text ||
    payload.device !== keyword.device ||
    payload.depth !== depth ||
    originalDomain !== domain ||
    (payload.location_code !== undefined
      ? payload.location_code !== keyword.locationRef.primaryGeoCode
      : payload.location_name !== keyword.locationRef.primaryGeoName) ||
    (payload.language_code !== undefined
      ? payload.language_code !== keyword.locationRef.languageCode
      : payload.language_name !== keyword.locationRef.languageLabel)
  )
    return "result_context_changed";
  const decision = decideOrganicResult({
    domain,
    depth,
    candidates: task.organicItems.map((item) => ({
      domain: item.domain,
      rank: item.rank_group,
      title: item.title,
      url: item.url,
    })),
  });
  const complete =
    ["success", "terminal_empty_success"].includes(task.classification) &&
    decision.outcome !== "indeterminate" &&
    (task.results.length > 0 || task.classification === "terminal_empty_success");
  const completeness =
    complete && check.preRecoveryFinishedAt
      ? "complete"
      : task.classification === "partial"
        ? "partial"
        : "unresolved";
  const raw = {
    organic_results: decision.organicResults,
    ...(decision.outcome !== "indeterminate"
      ? { normalization: organicResultNormalization(decision) }
      : {}),
    recovery: { completeness, returnedDepth: task.returnedDepth, comparisonAllowed: false },
  };
  if (completeness !== "complete") {
    const body = JSON.stringify({
      version: 2,
      task,
      raw,
      operationPk: identity.operationPk,
      attemptId,
    });
    if (Buffer.byteLength(body) > 4 * 1024 * 1024) return "result_too_large";
    const id = digest(JSON.stringify([identity.operationPk, attemptId, digest(body)]));
    await tx.providerPartialEvidence.upsert({
      where: { id },
      create: {
        id,
        namespace: identity.namespace,
        instanceId: identity.instanceId,
        rankCheckId: check.id,
        kind: completeness,
        schemaVersion: 2,
        payloadEncrypted: encryptSecret(body),
        identityHash: digest(body),
        returnedDepth: task.returnedDepth,
        finishedAt: check.preRecoveryFinishedAt,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 7 * 86400000),
      },
      update: {},
    });
    if (applyPartial)
      await tx.rankCheck.update({
        where: { id: check.id },
        data: {
          status: "failed",
          position: completeness === "partial" ? decision.position : null,
          rankingUrl: completeness === "partial" ? decision.rankingUrl : null,
          previousPosition: null,
          raw: raw as unknown as Prisma.InputJsonValue,
        },
      });
    return completeness;
  }
  const value = retainedRankResultEnvelopeV2.parse({
    version: 2,
    completeness: "complete",
    returnedDepth: task.returnedDepth ?? 0,
    operationPk: identity.operationPk,
    attemptId,
    finishedAt: check.preRecoveryFinishedAt?.toISOString(),
    contextHash: rankRecoveryContext(
      {
        text: keyword.text,
        device: keyword.device,
        domain,
        location: keyword.locationRef,
        revision: identity.keywordRevision,
      },
      depth,
    ),
    target: {
      keywordId: check.keywordId,
      projectId: keyword.projectId,
      queuedTaskId: identity.queuedTaskId,
      expectedUrlAtCheck: check.expectedUrlAtCheck,
      attempts: Array.isArray(check.attempts) ? check.attempts : [],
    },
    result: {
      comparisonAllowed: false,
      rankCheck: {
        keywordId: check.keywordId,
        provider: identity.provider,
        checkedAt: check.checkedAt.toISOString(),
        requestedDepth: depth,
        position: decision.position,
        previousPosition: null,
        rankingUrl: decision.rankingUrl,
        normalizationVersion: CURRENT_RANK_NORMALIZATION_VERSION,
        organicRanks: decision.organicResults.map((item) => ({
          domain: item.domain,
          position: item.rank,
        })),
        raw,
        billingUnits: null,
        costCents: task.costCents,
        estimatedCostCents: null,
      },
    },
  });
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body) > 4 * 1024 * 1024) return "result_too_large";
  await tx.rankCheckResultEvidence.createMany({
    data: {
      namespace: identity.namespace,
      instanceId: identity.instanceId,
      rankCheckId: check.id,
      schemaVersion: 2,
      payloadEncrypted: encryptSecret(body),
      identityHash: digest(body),
      createdAt: now,
      expiresAt: new Date(now.getTime() + 7 * 86400000),
    },
    skipDuplicates: true,
  });
  return "complete";
}
