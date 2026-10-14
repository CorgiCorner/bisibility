import type { LocalCapability } from "@/lib/local-monitoring/capability";
import type { SubmissionRecord } from "@/lib/local-monitoring/execution-types";
import { executionTargetKey, operationKey } from "@/lib/local-monitoring/target-key";
import type { LocalNormalizationPort } from "@/lib/local-monitoring-store/evidence-types";
import type { DocumentedLocalAdapter, LocalProviderBinding, LocalProviderPorts } from "./contracts";
import { mapsTaskRequest, supportedMapsAdapterVersion } from "./maps-capability";
import { parseMapsResult } from "./maps-result";
import { object } from "./records";
import { localTaskGetUrl, nativeTaskId } from "./request";
import { parseLocalSubmission, unknownLocalSubmission } from "./submission";

function assertRecord(record: SubmissionRecord, binding: LocalProviderBinding) {
  if (
    record.provider !== "dataforseo" ||
    !supportedMapsAdapterVersion(record.adapterVersion) ||
    record.scope.projectId !== binding.target.projectId ||
    operationKey(record.scope) !== record.key ||
    record.targetKey !== executionTargetKey(binding.target) ||
    !record.attemptId ||
    !record.settlementRecorded ||
    !["accepted", "unknown_acceptance"].includes(record.status) ||
    !record.outcome ||
    record.outcome.taskIds.length !== 1 ||
    !nativeTaskId(record.outcome.taskIds[0])
  )
    throw new Error("Original settled Maps task custody is required.");
}
export function createMapsAdapter<DispatchEvidence>(input: {
  binding: LocalProviderBinding;
  capability: LocalCapability;
  providerPriceVersion: string;
  ports: LocalProviderPorts<DispatchEvidence>;
  retainedRecord?: SubmissionRecord;
}): DocumentedLocalAdapter {
  const binding = structuredClone(input.binding),
    expected = mapsTaskRequest(binding);
  let attempted = false;
  let retained = input.retainedRecord ? structuredClone(input.retainedRecord) : null;
  return {
    capability: input.capability,
    providerPriceVersion: input.providerPriceVersion,
    buildRequest({ target, point }) {
      if (
        executionTargetKey(target) !== executionTargetKey(binding.target) ||
        point.revisionKey !== binding.point.revisionKey
      )
        throw new Error("Maps item binding changed.");
      return structuredClone(expected);
    },
    async assertPreparedQuote(request, quote) {
      await input.ports.assertPreparedBinding(request, expected);
      await input.ports.assertPreparedQuote(request, quote);
    },
    async submit(request) {
      if (attempted)
        throw new Error(
          "Original Maps POST was already attempted; reconcile without resubmission.",
        );
      attempted = true;
      await input.ports.assertPreparedBinding(request, expected);
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
        return { ...outcome, acceptance: "unknown", usage: { ...outcome.usage, failed: true } };
      }
      return { ...outcome, dispatchEvidenceVerified: true };
    },
    async assertRetrieval(record) {
      assertRecord(record, binding);
      await input.ports.assertRetrieval(record);
      retained = structuredClone(record);
    },
    async collect(ids) {
      if (!retained) throw new Error("Original Maps collection binding is missing.");
      assertRecord(retained, binding);
      if (ids.length !== 1 || ids[0] !== retained.outcome?.taskIds[0])
        throw new Error("Maps collection task ID changed.");
      await input.ports.assertRetrieval(retained);
      const data = await input.ports.retrieveEnvelope(localTaskGetUrl("maps", ids[0]));
      const receivedAt = input.ports.clock();
      const run = parseMapsResult(data, ids[0], binding, receivedAt, retained.adapterVersion);
      return {
        taskIds: [...ids],
        observedAt: run.requestPolicy.evidence?.observedAt ?? null,
        completeness: "unknown",
        completeThrough: null,
        payload: { version: 1, taskId: ids[0], data, receivedAt: receivedAt.toISOString() },
      };
    },
  };
}
export function mapsNormalizer(binding: LocalProviderBinding): LocalNormalizationPort {
  return {
    async normalize({ record, result, target, point }) {
      assertRecord(record, binding);
      if (
        executionTargetKey(target) !== executionTargetKey(binding.target) ||
        point.revisionKey !== binding.point.revisionKey
      )
        throw new Error("Retained Maps target changed.");
      const payload = object(result.payload);
      if (
        payload?.version !== 1 ||
        payload.taskId !== record.outcome?.taskIds[0] ||
        typeof payload.receivedAt !== "string"
      )
        throw new Error("Invalid retained Maps payload.");
      return parseMapsResult(
        payload.data,
        String(payload.taskId),
        binding,
        new Date(payload.receivedAt),
        record.adapterVersion,
      );
    },
  };
}
