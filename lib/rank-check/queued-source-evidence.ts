import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { recoveryInstance } from "@/lib/metering/recovery/tokens";
import { meteringNamespace } from "@/lib/metering/runtime";
import { decryptSecret, encryptSecret } from "@/lib/providers/crypto";
import type { RedirectResolution } from "@/lib/providers/serp/redirect-resolution";
import { QUEUED_SOURCE_EVIDENCE_SCHEMA_VERSION } from "@/lib/rank-check/queued-source-schema";
import { RankCheckClosedBeforePersistenceError } from "./persistence-errors";
import {
  assertQueuedPersistenceLease,
  type QueuedPersistenceLease,
} from "./queued-persistence-lease";
import { queuedResultReleaseTransactionOptions } from "./queued-result-attempt";

/**
 * `store_unavailable` is transient: the task is released and retried. Every other reason is
 * deterministic, so retrying cannot help and the affected task alone fails terminally.
 */
export type QueuedSourceEvidenceReason =
  | "store_unavailable"
  | "identity_mismatch"
  | "unreadable"
  | "oversize"
  | "conflict"
  | "credential_echo";

export class QueuedSourceEvidenceError extends Error {
  readonly permanent: boolean;

  constructor(readonly reason: QueuedSourceEvidenceReason = "store_unavailable") {
    super(`Retained queued source evidence is unavailable (${reason}).`);
    this.name = "QueuedSourceEvidenceError";
    this.permanent = reason !== "store_unavailable";
  }
}

export async function withQueuedSourceEvidence<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof RankCheckClosedBeforePersistenceError ||
      error instanceof QueuedSourceEvidenceError
    )
      throw error;
    throw new QueuedSourceEvidenceError();
  }
}

const hash = (body: string) => createHash("sha256").update(body).digest("hex");
export const QUEUED_SOURCE_MAX_BYTES = 4 * 1024 * 1024;
/** Progress rows per source: completed attempts plus interrupted ones that kept new mappings. */
export const QUEUED_REDIRECT_MAX_PROGRESS_ROWS = 6;

export type QueuedSourceIdentity = {
  taskId: string;
  providerTaskId: string;
  rankCheckId: string;
  connectionId: string;
  contextHash: string;
  credentialBinding: string;
};
type Source = { identity: QueuedSourceIdentity; data: unknown; version: 1 };
export type QueuedResolutionProgress = {
  /** Completed conversion attempts; an attempt interrupted by cancellation is not counted. */
  attempts: number;
  mappings: Record<string, string>;
  resolutions: RedirectResolution[];
  sequence: number;
};
type Progress = QueuedResolutionProgress & {
  identity: QueuedSourceIdentity;
  sourceHash: string;
  version: 1;
};

function id(identity: QueuedSourceIdentity, suffix: string) {
  const { credentialBinding: _credentialBinding, ...keyIdentity } = identity;
  return hash(
    JSON.stringify(["queued-source", meteringNamespace(), recoveryInstance(), keyIdentity, suffix]),
  );
}

/** The binding may have been written under any key of the current keyring. */
function sameIdentity(
  stored: QueuedSourceIdentity,
  identity: QueuedSourceIdentity,
  bindings: readonly string[],
) {
  const { credentialBinding, ...rest } = stored;
  const { credentialBinding: _current, ...expected } = identity;
  return (
    JSON.stringify(rest) === JSON.stringify(expected) &&
    [identity.credentialBinding, ...bindings].includes(credentialBinding)
  );
}

async function read<T>(key: string): Promise<{ value: T; hash: string } | null> {
  const row = await prisma.providerPartialEvidence.findUnique({ where: { id: key } });
  if (!row) return null;
  try {
    const body = decryptSecret(row.payloadEncrypted);
    if (
      hash(body) !== row.identityHash ||
      row.schemaVersion !== QUEUED_SOURCE_EVIDENCE_SCHEMA_VERSION
    )
      throw new Error("Retained source evidence is unreadable.");
    return { value: JSON.parse(body) as T, hash: row.identityHash };
  } catch {
    throw new QueuedSourceEvidenceError("unreadable");
  }
}

async function write(
  identity: QueuedSourceIdentity,
  suffix: string,
  value: Source | Progress,
  lease: QueuedPersistenceLease,
) {
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body) > QUEUED_SOURCE_MAX_BYTES)
    throw new QueuedSourceEvidenceError("oversize");
  const key = id(identity, suffix);
  const identityHash = hash(body);
  await prisma.$transaction(async (tx) => {
    await assertQueuedPersistenceLease(tx, lease);
    const row = await tx.providerPartialEvidence.upsert({
      where: { id: key },
      create: {
        id: key,
        namespace: meteringNamespace(),
        instanceId: recoveryInstance(),
        rankCheckId: identity.rankCheckId,
        kind: "unresolved",
        schemaVersion: QUEUED_SOURCE_EVIDENCE_SCHEMA_VERSION,
        payloadEncrypted: encryptSecret(body),
        identityHash,
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
      update: {},
    });
    if (row.identityHash !== identityHash) throw new QueuedSourceEvidenceError("conflict");
  }, queuedResultReleaseTransactionOptions);
  return identityHash;
}

export async function retainQueuedSource(
  identity: QueuedSourceIdentity,
  data: unknown,
  lease: QueuedPersistenceLease,
) {
  const value: Source = { identity, data, version: 1 };
  return write(identity, "source", value, lease);
}

export async function readQueuedSource(
  identity: QueuedSourceIdentity,
  bindings: readonly string[] = [],
) {
  const source = await read<Source>(id(identity, "source"));
  if (!source) return null;
  if (source.value.version !== 1 || !sameIdentity(source.value.identity, identity, bindings))
    throw new QueuedSourceEvidenceError("identity_mismatch");
  return { data: source.value.data, sourceHash: source.hash };
}

export async function readQueuedResolution(
  identity: QueuedSourceIdentity,
  sourceHash: string,
  bindings: readonly string[] = [],
): Promise<QueuedResolutionProgress | null> {
  let latest: Progress | null = null;
  for (let sequence = 1; sequence <= QUEUED_REDIRECT_MAX_PROGRESS_ROWS; sequence += 1) {
    const row = await read<Progress>(id(identity, `resolution:${sequence}`));
    if (!row) break;
    const progress = row.value;
    if (
      progress.version !== 1 ||
      progress.sequence !== sequence ||
      progress.sourceHash !== sourceHash ||
      !sameIdentity(progress.identity, identity, bindings)
    )
      throw new QueuedSourceEvidenceError("identity_mismatch");
    latest = progress;
  }
  return latest;
}

export async function retainQueuedResolution(
  identity: QueuedSourceIdentity,
  sourceHash: string,
  progress: QueuedResolutionProgress,
  lease: QueuedPersistenceLease,
) {
  return write(
    identity,
    `resolution:${progress.sequence}`,
    { ...progress, identity, sourceHash, version: 1 },
    lease,
  );
}
