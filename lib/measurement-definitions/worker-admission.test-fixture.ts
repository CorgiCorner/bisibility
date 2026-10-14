import type { RunCheckInput } from "@/lib/rank-check/runner";
import { RANK_REPORT_CALENDAR_CONFIGURATION } from "@/lib/rank-reports/host-policy";
import type { SerpDepth } from "@/lib/serp/constants";
import { frozenRequest } from "./canonical";
import { DefinitionUnavailableError } from "./errors";
import { definitionHeadFixture, definitionSourceFixture } from "./fixtures";
import { hostDefinitionAdapters } from "./host-adapters";
import type { DefinitionBinding, DefinitionSource } from "./model";
import { nativeReferenceMatches, type WorkerDefinitionScope } from "./worker-authority";
import { assertDefinitionExecutionPermit } from "./worker-claim";
import { nativeDefinitionRequestProof } from "./worker-request-proof";
import type { WorkerDefinitionSession } from "./worker-session";

const capturedBindings = new Map<string, DefinitionBinding>();
export function resetCapturedWorkerBindings() {
  capturedBindings.clear();
}

function freezeCaptured<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeCaptured);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

export function capturedWorkerBindingQueryFixture(query: unknown, values: readonly unknown[]) {
  const sql = workerQueryText(query);
  if (!sql.includes("FROM measurement_execution_bindings")) return undefined;
  const binding = capturedBindings.get(String(values[0]));
  if (!binding || values[1] !== binding.projectId || values[2] !== binding.owner.rankCheckId)
    return [];
  if (sql.includes('AS "targetUrl"')) return [{ targetUrl: binding.request.targetUrl }];
  return sql.includes("SELECT request") ? [{ request: binding.request }] : [binding];
}

export function workerQueryText(query: unknown) {
  if (Array.isArray(query)) return query.join("?");
  const raw = query as { sql?: string; strings?: readonly string[] };
  return raw.sql ?? raw.strings?.join("?") ?? "";
}

export function workerPrincipalFixture(rankCheckId: string) {
  return {
    actorId: "actor_1",
    runId: `run_${rankCheckId}`,
    runItemId: `item_${rankCheckId}`,
    source: "app",
    trigger: "manual",
    credentialKind: null,
    credentialId: null,
    selectionKind: "single",
    selectionHash: "fixture-selection",
    checkScheduleId: null,
  };
}

export function workerSourceFixture(projectId: string, keywordId: string, text = "rank tracker") {
  const source = definitionSourceFixture();
  source.projectId = projectId;
  source.projectPublicId = "prj_abcdefghijklmnopqrstuvwx";
  source.keywordId = keywordId;
  source.keywordPublicId = "kw_abcdefghijklmnopqrstuvwx";
  source.target.domain = "example.com";
  source.target.targetUrl = null;
  source.target.text = text;
  source.target.locationId = "location_active";
  source.target.location.id = "location_active";
  source.policy.config = {
    version: 1,
    definitionVersion: "web-organic-v1",
    forcedAiOverview: false,
    adapters: hostDefinitionAdapters(),
    freshness: {
      configurationRevision: RANK_REPORT_CALENDAR_CONFIGURATION,
      manualTtlMs: null,
      cadenceGraceMs: null,
    },
  };
  return source;
}

export function workerDefinitionQueryFixture(
  query: unknown,
  values: readonly unknown[],
  sourceForKeyword = workerSourceFixture,
) {
  const sql = workerQueryText(query);
  if (sql.includes("to_regclass")) return [{ tables: 4, source: true, guard: true }];
  if (sql.includes("SELECT measurement_definition_authority_intact()")) return [{ intact: true }];
  if (sql.includes("SELECT measurement_definition_source("))
    return [{ source: sourceForKeyword(String(values[0]), String(values[1])) }];
  if (sql.startsWith("SELECT id FROM keywords WHERE")) return [{ id: values[0] }];
  if (sql.includes("SELECT id FROM users WHERE")) return [{ id: values[0] }];
  if (sql.includes("SELECT role FROM memberships WHERE")) return [{ role: "admin" }];
  return undefined;
}

export function retainedWorkerBindingFixture(
  source: DefinitionSource,
  rankCheckId: string,
  queuedTaskId: string | null = null,
  providerId = "dataforseo",
  depth: SerpDepth = 100,
) {
  const head = definitionHeadFixture(source);
  return {
    projectId: source.projectId,
    keywordId: source.keywordId,
    source,
    targetRevision: head.targetRevision,
    policyRevision: head.policyRevision,
    capturedAt: head.capturedAt,
    request: frozenRequest(source, providerId, depth),
    id: `binding_${rankCheckId}_${providerId}`,
    owner: {
      rankCheckId,
      executionKey: queuedTaskId
        ? `queued-definition:${queuedTaskId}`
        : `definition:${rankCheckId}:${providerId}:connection_${providerId}`,
      queuedTaskId,
    },
  };
}

/** Positive runner fixtures represent a prepared project/run owner, never a bare paid request. */
export function admittedRunnerInput<T>(original: T): T {
  const input = original as RunCheckInput & { connections?: RunCheckInput["connection"][] };
  const paidProviders = ["dataforseo", "serpapi"];
  if (
    input.keyword &&
    !paidProviders.includes(input.connection?.provider ?? "") &&
    !input.connections?.some((entry) => paidProviders.includes(entry.provider))
  )
    return original;
  return {
    ...input,
    projectId: input.projectId ?? "project_1",
    rankCheckId: input.rankCheckId ?? "rank_fixture_1",
    ...(input.connection
      ? {
          connection: {
            ...input.connection,
            id: input.connection.id ?? `connection_${input.connection.provider}`,
          },
        }
      : {}),
    ...(input.connections
      ? {
          connections: input.connections.map((connection) => ({
            ...connection,
            id:
              connection.id ??
              (paidProviders.includes(connection.provider)
                ? `connection_${connection.provider}`
                : undefined),
          })),
        }
      : {}),
  } as T;
}

/** Isolated captured-definition port for runner tests; native request semantics remain real. */
export function capturedWorkerSessionFixture(
  input: RunCheckInput,
  providerId: string,
  queuedTaskId: string | null = null,
): WorkerDefinitionSession {
  if (
    !input.projectId ||
    !input.rankCheckId ||
    !input.keyword.id ||
    !input.connection.id ||
    providerId !== input.connection.provider
  )
    throw new DefinitionUnavailableError();
  if (input.definitionPermit) {
    assertDefinitionExecutionPermit(input.definitionPermit);
    if (input.definitionPermit.rankCheckId !== input.rankCheckId)
      throw new DefinitionUnavailableError();
  }
  const connectionId = input.connection.id;
  const principal = freezeCaptured(
    structuredClone(
      input.definitionPermit?.principal ?? {
        ...workerPrincipalFixture(input.rankCheckId),
        source: input.providerUsage?.context.source ?? "app",
        trigger: input.providerUsage?.context.trigger ?? "manual",
        actorId: input.providerUsage?.credential ? null : "actor_1",
        credentialId: input.providerUsage?.credential?.id ?? null,
        credentialKind: input.providerUsage?.credential?.kind ?? null,
      },
    ),
  );
  const source = workerSourceFixture(input.projectId, input.keyword.id, input.keyword.text);
  const location = input.keyword.location;
  source.target.domain = input.keyword.domain;
  source.target.device = input.keyword.device;
  source.target.location = {
    ...source.target.location,
    kind: (input as RunCheckInput & { locationGranular?: boolean }).locationGranular
      ? "city"
      : "country",
    displayName: location.secondaryGeoName,
    gl: location.gl,
    hl: location.hl,
    languageCode: location.hl,
    primaryGeoCode: location.primaryGeoCode,
    primaryGeoName: location.primaryGeoName,
    secondaryGeoName: location.secondaryGeoName,
  };
  if (!source.policy.defaults) throw new DefinitionUnavailableError();
  source.policy.defaults.serpStopOnMatch = input.stopOnMatch ?? true;
  const binding = retainedWorkerBindingFixture(
    source,
    input.rankCheckId,
    queuedTaskId,
    providerId,
    input.depth ?? 100,
  );
  if (!queuedTaskId)
    binding.owner.executionKey = `definition:${input.rankCheckId}:${providerId}:${input.connection.id}`;
  freezeCaptured(binding);
  capturedBindings.set(binding.id, binding);
  // Comparison-only projection; this does not create or grant an execution permit.
  const scope = freezeCaptured({
    projectId: binding.projectId,
    keywordId: binding.keywordId,
    providerId,
    connectionId,
    owner: binding.owner,
    credentialSource: input.connection.credentialSource === "hosted" ? "hosted" : "own",
    permit: { principal },
  }) as WorkerDefinitionScope;
  const assertReferences: WorkerDefinitionSession["beforeFence"]["assertDispatch"] = async (
    _tx,
    references,
  ) => {
    if (!references.length || references.some((ref) => !nativeReferenceMatches(scope, ref)))
      throw new DefinitionUnavailableError();
  };
  return freezeCaptured({
    binding,
    beforeReserve: {
      lockBusiness: async (_tx, _operationId, request) => {
        nativeDefinitionRequestProof(binding, request);
      },
      assertRequest: async (_tx, _operationId, request) => {
        nativeDefinitionRequestProof(binding, request);
      },
    },
    beforeFence: { lockBusiness: assertReferences, assertDispatch: assertReferences },
  });
}
