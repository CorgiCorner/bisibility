import "server-only";
import type { LocalSubmitCollectAdapter } from "@/lib/local-monitoring/execution-types";
import { executionTargetKey } from "@/lib/local-monitoring/target-key";
import type { OriginalLocalProofBinding } from "@/lib/local-monitoring-store/acceptance-proof";
import { localDigest, localRequestHash } from "@/lib/local-monitoring-store/canonical";
import type { LocalDatabase } from "@/lib/local-monitoring-store/context";
import type {
  DocumentedLocalAdapter,
  LocalProviderBinding,
} from "@/lib/providers/local-search/contracts";
import { buildLocalTaskRequest } from "@/lib/providers/local-search/request";
import { PricedRequest } from "@usagekit/providers";
import { OriginalSubmitProofConflictError } from "./errors";
import { retainOriginalLocalSubmit } from "./proof-retention";
import { onceOnlyCapturedLocalSubmit } from "./submission-reply";

/** Caller supplies the server-loaded immutable target and current prepared transport adapter. */
export function bindRetainedLocalAdapter(input: {
  adapter: DocumentedLocalAdapter;
  binding: LocalProviderBinding;
  db: LocalDatabase;
  buildRequest?: typeof buildLocalTaskRequest;
}) {
  const binding = structuredClone(input.binding);
  const expected = (input.buildRequest ?? buildLocalTaskRequest)(binding);
  const adapterVersion = input.adapter.capability.adapterVersion;
  if (typeof expected.body !== "string") throw new OriginalSubmitProofConflictError();
  const expectedBody = JSON.parse(expected.body);
  // No awaited DB work is inserted between the producer fence and underlying submit.
  const captured = onceOnlyCapturedLocalSubmit<PricedRequest>({
    assertRequest(request) {
      if (
        !(request instanceof PricedRequest) ||
        request.admission.outcome !== "reserved" ||
        request.input.provider !== "dataforseo" ||
        request.input.scope.group !== binding.target.projectId ||
        request.method !== expected.method ||
        request.url !== expected.url ||
        localDigest(request.parsed.body) !== localDigest(expectedBody)
      )
        throw new OriginalSubmitProofConflictError();
    },
    submit: (request) => input.adapter.submit(request),
    async retain(request, outcome) {
      if (request.admission.outcome !== "reserved") throw new OriginalSubmitProofConflictError();
      const operation = request.admission.operation;
      const item = await input.db.localMeasurementRunItem.findFirst({
        where: {
          preparedAttemptId: operation.operationId,
          projectId: binding.target.projectId,
          namespace: operation.scope.namespace,
        },
      });
      if (
        item?.provider !== "dataforseo" ||
        item.connectionId !== operation.scope.connection ||
        item.credentialVersion !== operation.scope.providerCredentialVersion ||
        item.requestHash !== localRequestHash(expected)
      )
        throw new OriginalSubmitProofConflictError();
      const custody: OriginalLocalProofBinding = {
        projectId: item.projectId,
        connectionId: item.connectionId,
        provider: item.provider,
        credentialVersion: item.credentialVersion,
        correlationId: item.correlationId,
        namespace: item.namespace,
        preparedAttemptId: item.preparedAttemptId,
        preparedLeaseId: item.preparedLeaseId,
        requestHash: item.requestHash,
        attemptId: operation.operationId,
        operationKey: item.operationKey,
        targetKey: executionTargetKey(binding.target),
        adapterVersion,
        device: binding.target.device,
      };
      return retainOriginalLocalSubmit(input.db, custody, outcome);
    },
  });
  const adapter: LocalSubmitCollectAdapter = { ...input.adapter, submit: captured.submit };
  return { adapter, diagnostic: captured.diagnostic };
}
