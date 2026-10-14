import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { LocalMeasurementRunItem } from "@/lib/generated/prisma/client";
import type { SubmissionRecord } from "@/lib/local-monitoring/execution-types";
import { executionTargetKey } from "@/lib/local-monitoring/target-key";
import type { ExecutionTargetV1, PointRevision } from "@/lib/local-monitoring/types";
import { type LocalProjectScope, localProjectScope } from "@/lib/local-monitoring-store/access";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import type { LocalDatabase, LocalTransaction } from "@/lib/local-monitoring-store/context";
import { assertLocalCustody } from "@/lib/local-monitoring-store/custody";
import { lockedLocalItem } from "@/lib/local-monitoring-store/repository";
import { ownAdmission } from "@/lib/provider-usage/admission-extension";
import { createMapsAdapter, mapsNormalizer } from "@/lib/providers/local-search/maps-adapter";
import {
  mapsRetrievalCapability,
  mapsTaskRequest,
  supportedMapsAdapterVersion,
} from "@/lib/providers/local-search/maps-capability";
import { object } from "@/lib/providers/local-search/records";
import { localTaskGetUrl } from "@/lib/providers/local-search/request";
import { requireDataForSeoLogin } from "@/lib/providers/serp/dataforseo-client";
import { developmentMapsTransport } from "./development-transport";
import { mapsCredentials, readMapsConnection, sameMapsConnection } from "./maps-connection";
import { retainMapsCollectionMatch } from "./maps-match";

export async function resolveMapsCollectionPorts(
  tx: LocalTransaction,
  input: {
    scope: LocalProjectScope;
    item: LocalMeasurementRunItem;
    record: SubmissionRecord;
    target: ExecutionTargetV1;
    point: PointRevision;
  },
  db: LocalDatabase = prisma,
) {
  const { scope, item, record, target, point } = input;
  if (
    item.projectId !== scope.project.id ||
    item.operationKey !== record.key ||
    target.projectId !== scope.project.id ||
    !supportedMapsAdapterVersion(record.adapterVersion) ||
    !record.outcome ||
    record.outcome.taskIds.length !== 1
  )
    throw new Error("Original Maps collection scope is unavailable.");
  const taskId = record.outcome.taskIds[0];
  const acceptedAt = record.outcome.receivedAt;
  if (
    target.surface !== "maps" ||
    record.targetKey !== executionTargetKey(target) ||
    target.pointRevision !== point.revisionKey
  )
    throw new Error("Original Maps target changed.");
  const reference = await tx.providerConnection.findFirst({
    where: { id: item.connectionId, projectId: scope.project.id },
    select: { publicId: true },
  });
  if (!reference) throw new Error("Original Maps connection is unavailable.");
  const connection = await readMapsConnection(tx, scope.project.id, reference.publicId);
  if (connection.version !== item.credentialVersion)
    throw new Error("Original Maps credentials changed.");
  const row = await tx.localMeasurementTarget.findFirst({
    where: { id: item.targetId, projectId: scope.project.id },
  });
  const storedPoint = row
    ? await tx.localMeasurementPoint.findFirst({
        where: { id: row.pointId, projectId: scope.project.id },
      })
    : null;
  const keyword = object(row?.keywordSnapshot);
  if (
    !row ||
    row.targetKey !== record.targetKey ||
    !storedPoint ||
    localDigest(storedPoint.point) !== localDigest(point) ||
    localDigest(row.target) !== localDigest(target) ||
    !keyword ||
    keyword.id !== target.keywordId ||
    typeof keyword.text !== "string"
  )
    throw new Error("Original Maps keyword is unavailable.");
  const binding = {
    target,
    point,
    keyword: { id: target.keywordId, revision: target.keywordRevision, text: keyword.text },
    requestedAt: null,
  };
  const clock = () => new Date();
  async function currentCustody() {
    const current = await db.$transaction(async (client) => {
      await localProjectScope(client, scope.context, scope.project.publicId, "read");
      const retained = await lockedLocalItem(client, scope.project.id, record.key);
      if (
        retained.item.id !== item.id ||
        localDigest(retained.record.outcome?.taskIds) !== localDigest(record.outcome?.taskIds)
      )
        throw new Error("Original Maps task set changed.");
      await assertLocalCustody(client, retained.item, retained.record);
      const value = await readMapsConnection(client, scope.project.id, connection.publicId);
      sameMapsConnection(connection, value);
      return value;
    });
    await ownAdmission.assertRetrieval(db, item.connectionId, [item.correlationId]);
    return current;
  }
  const forbidden = async (): Promise<never> => {
    throw new Error("Collection cannot submit or prepare Maps work.");
  };
  const adapter = createMapsAdapter({
    binding,
    capability: mapsRetrievalCapability(record.adapterVersion),
    providerPriceVersion: record.providerPriceVersion,
    retainedRecord: record,
    ports: {
      clock,
      submitPrepared: forbidden,
      assertPreparedBinding: forbidden,
      assertPreparedQuote: forbidden,
      assertDurableDispatchEvidence: forbidden,
      async assertRetrieval() {
        await currentCustody();
      },
      async retrieveEnvelope(url) {
        if (url !== localTaskGetUrl("maps", taskId))
          throw new Error("Maps retrieval endpoint changed.");
        const current = await currentCustody();
        const controller = new AbortController(),
          timer = setTimeout(() => controller.abort(), 10_000);
        try {
          const development = developmentMapsTransport({
            request: mapsTaskRequest(binding),
            operationId: item.id,
            receivedAt: new Date(acceptedAt),
          });
          const response = await (development ?? fetch)(url, {
            method: "GET",
            headers: development
              ? {}
              : { Authorization: requireDataForSeoLogin(mapsCredentials(current)) },
            signal: controller.signal,
            redirect: "error",
            cache: "no-store",
          });
          if (!response.ok) throw new Error("Maps result is not available.");
          return await response.json();
        } finally {
          clearTimeout(timer);
        }
      },
    },
  });
  return {
    adapter: { capability: adapter.capability, collect: adapter.collect },
    normalizer: { ...mapsNormalizer(binding), afterPersist: retainMapsCollectionMatch },
    clock,
  };
}
