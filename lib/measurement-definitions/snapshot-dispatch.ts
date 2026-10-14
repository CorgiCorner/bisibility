import "server-only";
import type {
  NativeRequestGuard,
  PaidFenceHook,
  PaidFenceReference,
} from "@/lib/metering/paid-attempt-types";
import { assertOperationAccessInTransaction } from "@/lib/operations/access-extension";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { SNAPSHOT_EXTENSION_WINDOW_MS } from "@/lib/serp/snapshot-extension";
import {
  readSnapshotContinuation,
  readSnapshotExtension,
} from "@/lib/serp/snapshot-extension-state";
import type { ProviderRequest } from "@usagekit/providers";
import { assertDefinitionActor } from "./access";
import { sameDefinitionBytes } from "./canonical";
import { DefinitionUnavailableError } from "./errors";
import type { DefinitionTransaction } from "./model";
import {
  assertCapturedSnapshotBinding,
  type SnapshotDefinitionBinding,
  snapshotNativeFingerprint,
} from "./snapshot-binding";

export type SnapshotDefinitionSession = Readonly<{
  binding: SnapshotDefinitionBinding;
  beforeFence: PaidFenceHook;
  beforeReserve: NativeRequestGuard;
}>;
const sessions = new WeakSet<object>();
export function assertSnapshotDefinitionSession(session: SnapshotDefinitionSession) {
  if (!sessions.has(session)) throw new DefinitionUnavailableError();
}
/** Only a freshly committed server-side snapshot lease can construct this continuation transport principal. */
export function snapshotDefinitionSession(
  binding: SnapshotDefinitionBinding,
  credentialVersion: string,
) {
  assertCapturedSnapshotBinding(binding);
  const lockBusiness = async (tx: DefinitionTransaction) => {
    await tx.$queryRaw`SELECT id FROM projects WHERE id=${binding.projectId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM provider_connections WHERE id=${binding.connectionId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM rank_checks WHERE id=${binding.rankCheckId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM users WHERE id=${binding.actorId} OR id=(SELECT "ownerId" FROM projects WHERE id=${binding.projectId}) ORDER BY id FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM memberships WHERE "projectId"=${binding.projectId} AND "userId"=${binding.actorId} FOR SHARE`;
  };
  const assertLease = async (tx: DefinitionTransaction) => {
    await assertDefinitionActor(tx, binding.actorId, binding.projectId, "update");
    const check = await tx.rankCheck.findFirst({
      where: {
        id: binding.rankCheckId,
        keywordId: binding.keywordId,
        keyword: { projectId: binding.projectId },
        status: "completed",
        provider: "serpapi",
      },
      select: { raw: true },
    });
    const project = await tx.project.findUnique({
      where: { id: binding.projectId },
      select: { writeMode: true, isSample: true },
    });
    const context = check && readSnapshotContinuation(check.raw);
    const state = context && readSnapshotExtension(check.raw, context);
    const age = Date.now() - Date.parse(binding.context.capturedAt);
    if (
      !project ||
      project.writeMode !== "active" ||
      project.isSample ||
      !context ||
      !state ||
      !sameDefinitionBytes(context, binding.context) ||
      state.state !== "running" ||
      state.requestId !== binding.id ||
      state.nextStart !== binding.nextStart ||
      state.leaseUntil !== binding.leaseUntil ||
      Date.parse(binding.leaseUntil) <= Date.now() ||
      age < 0 ||
      age >= SNAPSHOT_EXTENSION_WINDOW_MS
    )
      throw new DefinitionUnavailableError();
    const connection = await tx.providerConnection.findUnique({
      where: { id: binding.connectionId },
      select: {
        projectId: true,
        provider: true,
        enabled: true,
        status: true,
        credentialSource: true,
        credentialsEncrypted: true,
      },
    });
    if (
      !connection ||
      connection.projectId !== binding.projectId ||
      connection.provider !== "serpapi" ||
      !connection.enabled ||
      connection.status !== "connected" ||
      connection.credentialSource !== "own" ||
      ownCredentialVersion("serpapi", binding.connectionId, connection.credentialsEncrypted) !==
        credentialVersion
    )
      throw new DefinitionUnavailableError();
    await assertOperationAccessInTransaction(tx, binding.projectId);
  };
  const session: SnapshotDefinitionSession = {
    binding,
    beforeReserve: {
      lockBusiness: (tx) => lockBusiness(tx),
      async assertRequest(tx, operationId, request) {
        assertSnapshotNativeRequest(binding, request);
        await assertLease(tx);
        await tx.$executeRaw`INSERT INTO measurement_snapshot_request_attempts ("requestId","operationId","requestFingerprint")
          VALUES (${binding.id},${operationId},${snapshotNativeFingerprint(request!)})`;
      },
    },
    beforeFence: {
      async lockBusiness(tx, references) {
        assertSnapshotReferences(binding, references);
        await lockBusiness(tx);
      },
      async assertDispatch(tx, references) {
        assertSnapshotReferences(binding, references);
        await assertLease(tx);
        for (const ref of references) {
          const prepared = await tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT "operationId" AS id FROM measurement_snapshot_request_attempts WHERE "requestId"=${binding.id} AND "operationId"=${ref.operation.operationId}`;
          if (prepared.length !== 1) throw new DefinitionUnavailableError();
          await tx.$executeRaw`INSERT INTO measurement_snapshot_dispatch_proofs ("requestId",namespace,principal,"operationId","leaseId")
            VALUES (${binding.id},${ref.operation.scope.namespace},${ref.operation.scope.principal},${ref.operation.operationId},${ref.lease.leaseId})`;
        }
      },
    },
  };
  sessions.add(session);
  return Object.freeze(session);
}
/** Exact continuation offset/body, credential-free, before catalog pricing/reservation. */
export function assertSnapshotNativeRequest(
  binding: SnapshotDefinitionBinding,
  request?: ProviderRequest,
) {
  if (
    !request ||
    Object.keys(request.headers ?? {}).some((name) =>
      /^(authorization|proxy-authorization|x-api-key)$/iu.test(name),
    ) ||
    request.method !== "GET" ||
    request.body
  )
    throw new DefinitionUnavailableError();
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    throw new DefinitionUnavailableError();
  }
  const expected = {
    engine: "google",
    q: binding.context.keyword,
    device: binding.context.device,
    gl: binding.context.location.gl,
    hl: binding.context.location.hl,
    location: binding.context.location.secondaryGeoName,
    nfpr: "1",
    start: String(binding.nextStart),
  };
  if (
    url.origin !== "https://serpapi.com" ||
    url.pathname !== "/search.json" ||
    url.hash ||
    url.username ||
    url.password ||
    [...url.searchParams].length !== Object.keys(expected).length ||
    Object.entries(expected).some(
      ([key, value]) =>
        url.searchParams.getAll(key).length !== 1 || url.searchParams.get(key) !== value,
    )
  )
    throw new DefinitionUnavailableError();
}
function assertSnapshotReferences(
  binding: SnapshotDefinitionBinding,
  references: readonly PaidFenceReference[],
) {
  if (
    references.length !== 1 ||
    references.some(
      (ref) =>
        ref.operation.fundingSource !== "byok" ||
        ref.operation.provider !== "serpapi" ||
        ref.context.projectId !== binding.projectId ||
        ref.context.connectionId !== binding.connectionId ||
        ref.context.rankCheckId !== binding.rankCheckId ||
        ref.context.keywordId !== binding.keywordId ||
        ref.context.correlationId !== binding.rankCheckId,
    )
  )
    throw new DefinitionUnavailableError();
}
