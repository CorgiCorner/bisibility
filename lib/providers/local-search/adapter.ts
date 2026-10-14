import type {
  CollectedLocalResult,
  SubmissionRecord,
} from "@/lib/local-monitoring/execution-types";
import { executionTargetKey, operationKey } from "@/lib/local-monitoring/target-key";
import {
  type DocumentedLocalAdapter,
  disabledLocalCapability,
  LOCAL_ADAPTER_VERSION,
  type LocalProviderBinding,
  type LocalProviderPorts,
  type ParsedLocalPayload,
} from "./contracts";
import { parseLocalTaskResult } from "./observation";
import { buildLocalTaskRequest, localSurface, localTaskGetUrl, nativeTaskId } from "./request";
import { parseLocalSubmission, unknownLocalSubmission } from "./submission";

function sameIds(left: readonly string[], right: readonly string[]) {
  const sorted = [...right].sort();
  return (
    left.length === sorted.length &&
    [...left].sort().every((value, index) => value === sorted[index])
  );
}

/** Factory is deliberately unregistered; durable owner/transport acceptance remains required. */
export function createDataForSeoLocalAdapter<DispatchEvidence>(input: {
  binding: LocalProviderBinding;
  providerPriceVersion: string;
  ports: LocalProviderPorts<DispatchEvidence>;
}): DocumentedLocalAdapter {
  const binding = structuredClone(input.binding);
  const expected = buildLocalTaskRequest(binding);
  const targetKey = executionTargetKey(binding.target);
  const surface = localSurface(binding);
  let submissionAttempted = false;
  let retrievalRecord: SubmissionRecord | null = null;
  const checkRetrieval = async (record: SubmissionRecord) => {
    if (
      record.scope.projectId !== binding.target.projectId ||
      operationKey(record.scope) !== record.key ||
      record.targetKey !== targetKey ||
      record.provider !== "dataforseo" ||
      record.adapterVersion !== LOCAL_ADAPTER_VERSION ||
      !record.attemptId ||
      !record.settlementRecorded ||
      !["accepted", "unknown_acceptance"].includes(record.status) ||
      !record.outcome?.taskIds.length ||
      record.outcome.taskIds.some((id) => !nativeTaskId(id)) ||
      new Set(record.outcome.taskIds).size !== record.outcome.taskIds.length
    )
      throw new Error("Settled accepted local task custody is required");
    // Cancellation and expired quote do not erase accepted work. Current own
    // admission/receipt policy still authorizes each free retrieval separately.
    await input.ports.assertRetrieval(record);
  };
  return {
    capability: disabledLocalCapability,
    providerPriceVersion: input.providerPriceVersion,
    buildRequest: ({ target, point }) => {
      if (
        executionTargetKey(target) !== targetKey ||
        point.revisionKey !== binding.point.revisionKey ||
        point.contentHash !== binding.point.contentHash
      )
        throw new Error("Local adapter binding changed");
      return structuredClone(expected);
    },
    assertPreparedQuote: async (request, quote) => {
      await input.ports.assertPreparedBinding(request, structuredClone(expected));
      await input.ports.assertPreparedQuote(request, quote);
    },
    submit: async (request) => {
      if (submissionAttempted)
        throw new Error("Local submission already attempted; reconcile before retrying");
      // Fence synchronously before the first await so concurrent callers cannot
      // both pass validation and reach the injected one-shot transport.
      submissionAttempted = true;
      await input.ports.assertPreparedBinding(request, structuredClone(expected));
      let response: Awaited<ReturnType<typeof input.ports.submitPrepared>>;
      try {
        response = await input.ports.submitPrepared(request);
      } catch {
        return unknownLocalSubmission(input.ports.clock());
      }
      const outcome = parseLocalSubmission(response.data, response.ok, 1, input.ports.clock());
      try {
        await input.ports.assertDurableDispatchEvidence(response.dispatchEvidence, request);
      } catch {
        // Do not discard a received accepted subset or known mixed charges when
        // durable dispatch verification needs repair. Never perform another POST.
        return { ...outcome, acceptance: "unknown", usage: { ...outcome.usage, failed: true } };
      }
      return { ...outcome, dispatchEvidenceVerified: true };
    },
    assertRetrieval: async (record) => {
      await checkRetrieval(record);
      retrievalRecord = structuredClone(record);
    },
    collect: async (taskIds): Promise<CollectedLocalResult> => {
      const record = retrievalRecord;
      if (!record?.outcome || !sameIds(taskIds, record.outcome.taskIds))
        throw new Error("Current accepted task retrieval authorization is required");
      const payload: ParsedLocalPayload = {
        version: 1,
        provider: "dataforseo",
        adapterVersion: LOCAL_ADAPTER_VERSION,
        runs: [],
        identityIssues: [],
        unsupportedItemCount: 0,
      };
      const runs: ParsedLocalPayload["runs"][number][] = [];
      const issues: ParsedLocalPayload["identityIssues"][number][] = [];
      const times: (string | null)[] = [];
      let unsupported = 0;
      for (const id of taskIds) {
        await checkRetrieval(record);
        const data = await input.ports.retrieveEnvelope(localTaskGetUrl(surface, id));
        const result = parseLocalTaskResult({
          data,
          taskId: id,
          binding,
          receivedAt: input.ports.clock(),
        });
        runs.push(...result.payload.runs);
        issues.push(...result.payload.identityIssues);
        unsupported += result.payload.unsupportedItemCount;
        times.push(result.observedAt);
      }
      return {
        taskIds: [...taskIds],
        observedAt:
          times.length && times.every((time) => time !== null)
            ? (times as string[]).sort()[0]
            : null,
        payload: { ...payload, runs, identityIssues: issues, unsupportedItemCount: unsupported },
        completeness: "unknown",
        completeThrough: null,
      };
    },
  };
}
