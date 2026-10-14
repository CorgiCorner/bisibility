import type { Prisma } from "@/lib/generated/prisma/client";
import { frozenRequest } from "@/lib/measurement-definitions/canonical";
import { DefinitionUnavailableError } from "@/lib/measurement-definitions/errors";
import type { DefinitionBinding, DefinitionTransaction } from "@/lib/measurement-definitions/model";
import { definitionSourceSchema } from "@/lib/measurement-definitions/schema";
import {
  assertDefinitionExecutionPermit,
  claimDefinitionPaidCall,
  type DefinitionExecutionPermit,
} from "@/lib/measurement-definitions/worker-claim";
import type { queuedWorkerSessions } from "@/lib/measurement-definitions/worker-queued";
import { nativeDefinitionRequestProof } from "@/lib/measurement-definitions/worker-request-proof";
import type {
  liveWorkerDefinition,
  WorkerDefinitionSession,
  workerDefinitionOwner,
} from "@/lib/measurement-definitions/worker-session";
import { resolveEffectiveSerpDepth } from "@/lib/serp/constants";
import { definitionClaimQueryFixture } from "./definition-claim.test-fixture";
import { admittedDefinitionSourceFixture } from "./definition-policy.test-fixture";
import type { RunCheckInput } from "./runner";

const recordedBindings = new Map<string, DefinitionBinding>();
let recordedClaims = definitionClaimQueryFixture();
const recordedPermits = new Map<string, DefinitionExecutionPermit>();

export function resetRecordedWorkerDefinition(claims = definitionClaimQueryFixture()) {
  recordedBindings.clear();
  recordedPermits.clear();
  recordedClaims = claims;
}

/** Exact original-owner reads for the fixture's recorded capture, not a current-config fallback. */
export function recordedDefinitionQueryFixture(
  fallback: (
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ) => unknown = async () => [],
) {
  resetRecordedWorkerDefinition();
  return async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
    const sql = (Array.isArray(query) ? query : (query as Prisma.Sql).strings).join("?");
    const parameters = Array.isArray(query) ? values : (query as Prisma.Sql).values;
    if (!sql.includes("FROM measurement_execution_bindings")) return fallback(query, ...values);
    const binding = recordedBindings.get(String(parameters[0]));
    if (
      !binding ||
      binding.projectId !== parameters[1] ||
      binding.owner.rankCheckId !== parameters[2]
    )
      return [];
    return sql.includes("request->>'targetUrl'")
      ? [{ targetUrl: binding.request.targetUrl }]
      : [binding];
  };
}

/** Recorded semantic producer for billing units. Native authority/PG suites retain the real producer. */
export function recordedLiveWorkerDefinition(
  owner: typeof workerDefinitionOwner,
): typeof liveWorkerDefinition {
  return async (_db, input, providerId) => {
    if (!["dataforseo", "serpapi"].includes(providerId)) return null;
    return recordedSession(input, providerId, owner);
  };
}

async function recordedSession(
  input: RunCheckInput,
  providerId: string,
  owner: typeof workerDefinitionOwner,
  queuedTaskId: string | null = null,
  queuedPriority: 1 | 2 | null = null,
): Promise<WorkerDefinitionSession> {
  const rankCheckId = input.rankCheckId ?? "recorded-check";
  // Honor forwarded authority first. A legacy billing fixture bootstraps one claim per row only.
  let permit = input.definitionPermit ?? recordedPermits.get(rankCheckId) ?? null;
  if (permit) {
    assertDefinitionExecutionPermit(permit);
    if (permit.rankCheckId !== rankCheckId) throw new DefinitionUnavailableError();
  } else {
    const tx = { $queryRaw: recordedClaims } as unknown as DefinitionTransaction;
    permit = await claimDefinitionPaidCall(tx, rankCheckId, true);
    if (!permit) throw new DefinitionUnavailableError();
  }
  recordedPermits.set(rankCheckId, permit);
  const source = admittedDefinitionSourceFixture(
    input.projectId ?? "recorded-project",
    input.keyword.id,
  );
  source.target.text = input.keyword.text;
  source.target.domain = input.keyword.domain;
  source.target.targetUrl = null;
  source.target.device = input.keyword.device;
  source.target.location = {
    ...source.target.location,
    ...input.keyword.location,
    countryCode: input.keyword.location.gl.toUpperCase(),
    displayName: input.keyword.location.primaryGeoName,
    languageCode: input.keyword.location.hl,
  };
  source.policy.defaults!.serpStopOnMatch = input.stopOnMatch ?? true;
  source.policy.defaults!.serpDepth = input.depth ?? 100;
  const parsedSource = definitionSourceSchema.parse(source);
  const binding: DefinitionBinding = deepFreeze({
    id: "recorded-binding:" + rankCheckId + ":" + providerId,
    projectId: parsedSource.projectId,
    keywordId: parsedSource.keywordId,
    targetRevision: "recorded-target-revision",
    policyRevision: "recorded-policy-revision",
    owner: owner(permit, providerId, input.connection.id ?? "recorded-connection", queuedTaskId),
    request: frozenRequest(parsedSource, providerId, input.depth),
    source: parsedSource,
    capturedAt: input.now ?? new Date(),
  });
  recordedBindings.set(binding.id, binding);
  return {
    binding,
    // This fixture records semantic capture, not a substitute test of native authorization SQL.
    beforeFence: { lockBusiness: async () => {}, assertDispatch: async () => {} },
    beforeReserve: {
      lockBusiness: async () => {},
      assertRequest: async (_tx, _operationId, request) => {
        const proof = nativeDefinitionRequestProof(binding, request);
        // Same pure owner-route/priority contract as retainNativeDefinitionRequest.
        if (
          queuedTaskId
            ? proof.route !== "queued" ||
              queuedPriority === null ||
              proof.priority !== queuedPriority
            : proof.route !== "live"
        )
          throw new DefinitionUnavailableError();
      },
    },
  };
}

export function recordedQueuedWorkerSessions(
  owner: typeof workerDefinitionOwner,
): typeof queuedWorkerSessions {
  return async (batch) => {
    if (!batch.connection) throw new DefinitionUnavailableError();
    const sessions = new Map<string, WorkerDefinitionSession>();
    for (const task of batch.tasks) {
      const location = task.keyword.locationRef;
      sessions.set(
        task.id,
        await recordedSession(
          {
            connection: batch.connection,
            depth: resolveEffectiveSerpDepth({ requestedDepth: task.rankCheck.requestedDepth }),
            keyword: {
              id: task.keywordId,
              text: task.keyword.text,
              domain: batch.project.domain!,
              device: task.keyword.device,
              location: {
                gl: location.gl,
                hl: location.hl,
                primaryGeoCode: location.primaryGeoCode,
                primaryGeoName: location.primaryGeoName,
                secondaryGeoName: location.secondaryGeoName,
              },
            },
            projectId: batch.projectId,
            rankCheckId: task.rankCheckId,
            schedule: { frequency: "manual" },
            stopOnMatch: batch.project.defaults?.serpStopOnMatch ?? true,
          },
          "dataforseo",
          owner,
          task.id,
          batch.priority === "normal" ? 1 : batch.priority === "high" ? 2 : null,
        ),
      );
    }
    return sessions;
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
