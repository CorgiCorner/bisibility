import { connectionResponseRecorder } from "@/lib/provider-responses/connection";
import "server-only";
import { createHash, createHmac } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { DefinitionUnavailableError } from "@/lib/measurement-definitions/errors";
import { retainedQueuedDefinition } from "@/lib/measurement-definitions/worker-collection";
import { ownAdmission } from "@/lib/provider-usage/admission-extension";
import { resolveProviderCredentials } from "@/lib/providers/credentials";
import { getPurposeSecretKeys } from "@/lib/providers/crypto";
import type { DataForSeoItem } from "@/lib/providers/serp/dataforseo-payload";
import {
  DATA_FOR_SEO_NO_SEARCH_RESULTS_STATUS,
  dataForSeoOrganicDecision,
} from "@/lib/providers/serp/dataforseo-payload";
import { fetchDataForSeoQueuedResult } from "@/lib/providers/serp/dataforseo-queued";
import { dataForSeoRedirectTransport } from "@/lib/providers/serp/dataforseo-redirect-transport";
import {
  isRedirectRow,
  type RedirectRowsResolution,
  resolveRedirectRows,
  unresolvedRows,
} from "@/lib/providers/serp/redirect-resolution";
import type { ProviderCredentials } from "@/lib/providers/types";
import { explicitQueuedGetCostCents, queuedHostedRecovery } from "./queued-hosted-results";
import type { QueuedPersistenceLease } from "./queued-persistence-lease";
import { dataForSeoQueuedResponseTask, pollDataForSeoQueue } from "./queued-provider-poll";
import {
  QueuedResultDeadlineReachedError,
  queuedRedirectConversionTimeoutMs,
  throwIfQueuedResultAborted,
  throwIfQueuedResultDeadlineReached,
} from "./queued-result-attempt";
import type { QueuedTask } from "./queued-results-load";
import {
  QUEUED_REDIRECT_MAX_PROGRESS_ROWS,
  QueuedSourceEvidenceError,
  readQueuedResolution,
  readQueuedSource,
  retainQueuedResolution,
  retainQueuedSource,
  withQueuedSourceEvidence,
} from "./queued-source-evidence";

/** Completed conversion attempts before the check fails with unresolved redirects. */
export const QUEUED_REDIRECT_MAX_ATTEMPTS = 3;
const REQUEST_ECHO_FIELDS = [
  "location_name",
  "location_code",
  "language_code",
  "device",
  "stop_crawl_on_match",
];

function containsSecret(value: unknown, secrets: readonly string[]): boolean {
  if (typeof value === "string") return secrets.some((secret) => value.includes(secret));
  if (Array.isArray(value)) return value.some((item) => containsSecret(item, secrets));
  if (value && typeof value === "object")
    return Object.entries(value).some(
      ([key, item]) => containsSecret(key, secrets) || containsSecret(item, secrets),
    );
  return false;
}

/**
 * The login is an account identifier that ordinary result text can show (a support address), so
 * only the password and the authorization token derived from it block retention.
 */
function credentialSecrets(credentials: ProviderCredentials) {
  const { login, password } = credentials;
  if (typeof password !== "string" || password.length === 0) return [];
  return [password, Buffer.from(`${login ?? ""}:${password}`).toString("base64")];
}

/** One binding per keyring key, primary first, so a key rotation keeps retained sources valid. */
function credentialBindings(credentials: ProviderCredentials) {
  const body = JSON.stringify([credentials.login ?? null, credentials.password ?? null]);
  return getPurposeSecretKeys("queued-source-credential").map((key) =>
    createHmac("sha256", key).update(body).digest("hex"),
  );
}

function retainedTaskData(
  response: Awaited<ReturnType<typeof fetchDataForSeoQueuedResult>>,
  verified: NonNullable<ReturnType<typeof dataForSeoQueuedResponseTask>>,
) {
  const providerData = (verified as { data?: Record<string, unknown> }).data;
  const requestEcho =
    providerData &&
    Object.fromEntries(
      REQUEST_ECHO_FIELDS.filter((key) => Object.hasOwn(providerData, key)).map((key) => [
        key,
        providerData[key],
      ]),
    );
  const retainedTask = {
    id: verified.id,
    cost: verified.cost,
    status_code: verified.status_code,
    status_message: verified.status_message,
    result: verified.result,
    ...(requestEcho ? { data: requestEcho } : {}),
  };
  return {
    status_code: response.status_code,
    cost: (response as { cost?: number }).cost,
    tasks: [retainedTask],
  };
}

export function requiredQueuedDefinition<T>(definition: T | null) {
  if (!definition) throw new DefinitionUnavailableError();
  return definition;
}

export async function collectQueuedSource(
  task: QueuedTask,
  lease: QueuedPersistenceLease,
  signal: AbortSignal,
  options: { activityDeadlineAt?: Date; deadlineAt?: Date } = {},
) {
  if (!task.providerTaskId) throw new Error("Queued DataForSEO task is missing its provider id.");
  const providerTaskId = task.providerTaskId;
  const connection = task.batch.connection;
  if (!connection) throw new Error("DataForSEO connection is unavailable.");
  const recovery = await queuedHostedRecovery(task);
  if (connection.credentialSource === "hosted" && !recovery)
    throw new Error("Queued hosted execution is unavailable.");
  const own = !recovery && (await ownAdmission.assertRetrieval(prisma, connection.id, [task.id]));
  const assertRetrieval = async () => {
    if (recovery) await recovery.assertRetrieval();
    else await ownAdmission.assertRetrieval(prisma, connection.id, [task.id]);
  };
  const credentials =
    recovery?.credentials ??
    resolveProviderCredentials("dataforseo", connection.credentialsEncrypted);
  credentials.captureResponse = connectionResponseRecorder(
    connection.id,
    "dataforseo",
    "rank_check",
  );
  // A missing binding must not block the GET: a failed provider task settles without one.
  const definition = await retainedQueuedDefinition(task, lease);
  const bindings = credentialBindings(credentials);
  const identity = {
    taskId: task.id,
    providerTaskId,
    rankCheckId: task.rankCheckId,
    connectionId: connection.id,
    credentialBinding: bindings[0] as string,
    contextHash: createHash("sha256")
      .update(
        JSON.stringify([
          definition?.id ?? null,
          definition?.request ?? null,
          task.recoveryContextHash,
        ]),
      )
      .digest("hex"),
  };
  let source: { data: unknown; sourceHash: string | null } | null = await withQueuedSourceEvidence(
    () => readQueuedSource(identity, bindings),
  );
  let captured = false;
  // A permanent failure to retain a fresh source; the response is still in memory.
  let evidenceFailure: QueuedSourceEvidenceError | null = null;
  if (!source) {
    const polled = await pollDataForSeoQueue(
      credentials,
      task.keyword.projectId,
      async () => {
        await assertRetrieval();
        throwIfQueuedResultDeadlineReached(options.deadlineAt);
        return fetchDataForSeoQueuedResult(credentials, providerTaskId, { signal });
      },
      { deadlineAt: options.deadlineAt },
    );
    if (polled.status === "deadline_reached") throw new QueuedResultDeadlineReachedError();
    if (polled.status === "pending") return "pending";
    throwIfQueuedResultAborted(signal);
    const verified = dataForSeoQueuedResponseTask(polled.value, providerTaskId);
    if (!verified || polled.value.tasks?.length !== 1)
      throw new Error("Queued result identity does not match.");
    if ((recovery || own) && explicitQueuedGetCostCents(polled.value, providerTaskId) === null)
      return "pending";
    const data = retainedTaskData(polled.value, verified);
    let sourceHash: string | null = null;
    try {
      // Fail closed: a source that echoes a secret is never persisted.
      if (containsSecret(data, credentialSecrets(credentials)))
        throw new QueuedSourceEvidenceError("credential_echo");
      sourceHash = await withQueuedSourceEvidence(() => retainQueuedSource(identity, data, lease));
    } catch (error) {
      if (!(error instanceof QueuedSourceEvidenceError && error.permanent)) throw error;
      evidenceFailure = error;
    }
    source = { data, sourceHash };
    captured = true;
  }
  const retained = source;
  const data = retained.data as Awaited<ReturnType<typeof fetchDataForSeoQueuedResult>>;
  const providerTask = dataForSeoQueuedResponseTask(data, providerTaskId);
  if (!providerTask) throw new Error("Retained queued result identity does not match.");
  const sourceItems: (DataForSeoItem | null)[] =
    providerTask.status_code === DATA_FOR_SEO_NO_SEARCH_RESULTS_STATUS
      ? []
      : Array.isArray(providerTask.result)
        ? providerTask.result.flatMap((result) => result.items ?? [])
        : [null];
  const collected = (
    resolution: RedirectRowsResolution<DataForSeoItem | null> | null,
    failure: QueuedSourceEvidenceError | null = null,
  ) => ({
    evidenceFailure: failure,
    connection,
    recovery,
    own,
    definition,
    data,
    providerTask,
    items: resolution?.candidates ?? sourceItems,
    resolution,
  });
  // An oversized source is decided in memory as before when no conversion needs it retained.
  const canDecideInMemory = evidenceFailure?.reason === "oversize";
  const unretained = canDecideInMemory ? null : evidenceFailure;
  if (!sourceItems.some(isRedirectRow)) return collected(null, unretained);
  // Without a definition the check fails after usage settlement, as for any other result.
  if (!definition) return collected(null, unretained);
  // Convert only when a redirect row is what keeps the decision open.
  const { request } = definition;
  const sourceDecision = dataForSeoOrganicDecision(sourceItems, request.domain, request.depth);
  if (sourceDecision.outcome !== "indeterminate")
    return collected(unresolvedRows(sourceItems), unretained);
  if (evidenceFailure || retained.sourceHash === null)
    return collected(unresolvedRows(sourceItems), evidenceFailure ?? unretained);
  const sourceHash = retained.sourceHash;
  const progress = captured
    ? null
    : await withQueuedSourceEvidence(() => readQueuedResolution(identity, sourceHash, bindings));
  const known = await resolveRedirectRows(sourceItems, async () => [], progress?.mappings);
  const exhausted =
    (progress?.attempts ?? 0) >= QUEUED_REDIRECT_MAX_ATTEMPTS ||
    (progress?.sequence ?? 0) >= QUEUED_REDIRECT_MAX_PROGRESS_ROWS;
  if (!known.retryable || exhausted) return collected(known);
  // Conversion is its own phase: a freshly captured source is converted in a later pass.
  if (captured) return "pending";
  const timeoutMs = queuedRedirectConversionTimeoutMs(options.activityDeadlineAt);
  if (timeoutMs === null) return "pending";
  await assertRetrieval();
  const resolved = await resolveRedirectRows(
    sourceItems,
    dataForSeoRedirectTransport(
      credentials,
      timeoutMs,
      AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
    ),
    progress?.mappings,
  );
  // Cancellation is not a converter failure: keep new mappings without spending an attempt.
  const interrupted = signal.aborted;
  const gained =
    Object.keys(resolved.mappings).length > Object.keys(progress?.mappings ?? {}).length;
  if (!interrupted || gained)
    await withQueuedSourceEvidence(() =>
      retainQueuedResolution(
        identity,
        sourceHash,
        {
          attempts: (progress?.attempts ?? 0) + (interrupted ? 0 : 1),
          mappings: resolved.mappings,
          resolutions: resolved.resolutions,
          sequence: (progress?.sequence ?? 0) + 1,
        },
        lease,
      ),
    );
  throwIfQueuedResultAborted(signal);
  return "pending";
}
