import "server-only";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { readOnlyRecoveryTransaction } from "@/lib/provider-evidence/recovery/preview";
import {
  classifyGotoHistoryCandidate,
  GOTO_HISTORY_ANOMALY_CODE,
  GOTO_HISTORY_REDIRECT_CODE,
  GOTO_HISTORY_SOURCE_WINDOW_MS,
  type GotoHistoryCandidate,
  type GotoHistoryClass,
} from "./goto-history-eligibility";
import { QUEUED_SOURCE_EVIDENCE_SCHEMA_VERSION } from "./queued-source-schema";

type EvidenceRow = { expiresAt: Date; kind: string; schemaVersion: number };
type Reader = Prisma.TransactionClient | PrismaClient;

export type GotoHistoryPreviewRow = {
  checkId: string;
  classification: GotoHistoryClass;
};

export type GotoHistoryScanCursor = { checkedAt: Date; id: string };

const SCAN_PAGE = 50;

/** `limit` caps the repair set. Reading continues to the end of the window so `truncated` counts eligible rows left behind. */
export async function scanGotoHistoryCandidates(input: {
  classify: (id: string) => Promise<GotoHistoryClass | null>;
  limit: number;
  loadPage: (cursor: GotoHistoryScanCursor | null) => Promise<GotoHistoryScanCursor[]>;
}) {
  const rows: GotoHistoryPreviewRow[] = [];
  let examined = 0;
  let truncated = 0;
  let cursor: GotoHistoryScanCursor | null = null;
  for (;;) {
    const page = await input.loadPage(cursor);
    if (page.length === 0) break;
    for (const check of page) {
      cursor = check;
      const classification = await input.classify(check.id);
      if (!classification) continue;
      examined += 1;
      if (!classification.startsWith("eligible")) continue;
      if (rows.length < input.limit) rows.push({ checkId: check.id, classification });
      else truncated += 1;
    }
  }
  return { examined, rows, truncated };
}

function historyPage(
  db: Reader,
  input: { checkIds?: readonly string[]; now: Date },
  cursor: GotoHistoryScanCursor | null,
) {
  if (input.checkIds && input.checkIds.length === 0) return Promise.resolve([]);
  const anomaly = `%${GOTO_HISTORY_ANOMALY_CODE}%`;
  const windowStart = new Date(input.now.getTime() - GOTO_HISTORY_SOURCE_WINDOW_MS);
  const scope = input.checkIds
    ? Prisma.sql`AND id IN (${Prisma.join([...input.checkIds])})`
    : Prisma.sql`AND "checkedAt" >= ${windowStart} AND (
        "errorCode" = ${GOTO_HISTORY_REDIRECT_CODE}
        OR COALESCE(error, '') LIKE ${anomaly}
        OR COALESCE(attempts::text, '') LIKE ${anomaly}
        OR COALESCE(raw::text, '') LIKE ${anomaly}
        OR EXISTS (
          SELECT 1 FROM provider_partial_evidence evidence
          WHERE evidence."rankCheckId" = rank_checks.id
            AND evidence."expiresAt" > ${input.now}
            AND evidence."schemaVersion" = 2
            AND evidence.kind IN ('partial', 'unresolved')
        )
      )`;
  const after = cursor
    ? Prisma.sql`AND ("checkedAt" > ${cursor.checkedAt} OR ("checkedAt" = ${cursor.checkedAt} AND id > ${cursor.id}))`
    : Prisma.empty;
  // JSON string filters do not search inside objects, so the anomaly is matched on the stored text.
  return db.$queryRaw<GotoHistoryScanCursor[]>`
    SELECT id, "checkedAt"
    FROM rank_checks
    WHERE status = 'failed'
    ${scope}
    ${after}
    ORDER BY "checkedAt" ASC, id ASC
    LIMIT ${SCAN_PAGE}
  `;
}

function evidenceActive(rows: readonly EvidenceRow[], now: Date, schemaVersion: number) {
  return rows.some(
    (row) =>
      row.expiresAt > now &&
      row.schemaVersion === schemaVersion &&
      (schemaVersion === QUEUED_SOURCE_EVIDENCE_SCHEMA_VERSION
        ? row.kind === "unresolved"
        : row.kind === "partial" || row.kind === "unresolved"),
  );
}

export async function loadGotoHistoryCandidate(db: Reader, checkId: string, now: Date) {
  const check = await db.rankCheck.findUnique({
    where: { id: checkId },
    select: {
      attempts: true,
      checkedAt: true,
      error: true,
      errorCode: true,
      expectedUrlAtCheck: true,
      finishedAt: true,
      preRecoveryFinishedAt: true,
      id: true,
      keyword: {
        select: {
          device: true,
          id: true,
          locationRef: { select: { id: true, languageCode: true } },
          project: { select: { domain: true, id: true } },
          text: true,
          updatedAt: true,
        },
      },
      keywordId: true,
      partialEvidence: { select: { expiresAt: true, kind: true, schemaVersion: true } },
      queuedTask: {
        select: {
          batch: { select: { connectionId: true } },
          createdAt: true,
          id: true,
          persistenceLeaseExpiresAt: true,
          providerTaskId: true,
          recoveryContextHash: true,
        },
      },
      raw: true,
      recoveryRestoredAt: true,
      requestedDepth: true,
      run: { select: { deletedAt: true, status: true } },
      status: true,
    },
  });
  if (!check) return null;
  const identities = await db.providerDispatchIdentity.findMany({
    where: { rankCheckId: checkId },
    select: { connectionId: true },
  });
  const review = await db.providerRecoveryCandidate.findFirst({
    where: { intent: { state: "operator_review" }, rankCheckId: checkId },
    select: { id: true },
  });
  const connectionId = check.queuedTask?.batch.connectionId ?? null;
  const connectionMatches =
    identities.every((row) => row.connectionId === connectionId) &&
    (identities.length === 0 || Boolean(connectionId));
  const candidate: GotoHistoryCandidate = {
    attempts: check.attempts,
    connectionId,
    connectionMatches,
    error: check.error,
    errorCode: check.errorCode,
    finishedAt: check.finishedAt,
    now,
    operatorReviewPartial: Boolean(review) && evidenceActive(check.partialEvidence, now, 2),
    providerTaskId: check.queuedTask?.providerTaskId ?? null,
    raw: check.raw,
    recoveryRestoredAt: check.recoveryRestoredAt,
    retainedSource: evidenceActive(
      check.partialEvidence,
      now,
      QUEUED_SOURCE_EVIDENCE_SCHEMA_VERSION,
    ),
    run: check.run,
    status: check.status,
    taskCreatedAt: check.queuedTask?.createdAt ?? null,
  };
  return { candidate, check, classification: classifyGotoHistoryCandidate(candidate) };
}

export async function previewGotoHistory(input: {
  checkIds?: readonly string[];
  limit: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return readOnlyRecoveryTransaction(async (tx) => {
    const scan = await scanGotoHistoryCandidates({
      classify: async (id) => (await loadGotoHistoryCandidate(tx, id, now))?.classification ?? null,
      limit: input.limit,
      loadPage: (cursor) => historyPage(tx, { checkIds: input.checkIds, now }, cursor),
    });
    return {
      examined: scan.examined,
      providerCalls: 0,
      rows: scan.rows,
      truncated: scan.truncated,
      writes: 0,
    };
  });
}
