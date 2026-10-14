import "server-only";
import type { LocalCapability } from "@/lib/local-monitoring/capability";
import { assertLocalQuote, localQuoteHash } from "@/lib/local-monitoring/quote";
import type { LocalProjectScope } from "@/lib/local-monitoring-store/access";
import { localProjectScope } from "@/lib/local-monitoring-store/access";
import { localRequestHash } from "@/lib/local-monitoring-store/canonical";
import type { LocalDatabase } from "@/lib/local-monitoring-store/context";
import { assertLocalCustody, assertLocalPossibleSend } from "@/lib/local-monitoring-store/custody";
import type { LocalRunAdmission } from "@/lib/local-monitoring-store/run-admission";
import { localQuoteSchema, submissionRecordSchema } from "@/lib/local-monitoring-store/schema";
import {
  dispatchPricedRequest,
  type PricedRequest,
  type ProviderRequest,
} from "@usagekit/providers";
import { developmentMapsTransport } from "./development-transport";
import type { MapsConnection } from "./maps-connection";
import { mapsCredentials, readMapsConnection, sameMapsConnection } from "./maps-connection";
import { assertMapsPricedRequest } from "./maps-pricing";

const timeoutMs = 10_000;
const strictFetch: typeof fetch = (url, init) => fetch(url, { ...init, redirect: "error" });
export function mapsSubmitTransport(input: {
  db: LocalDatabase;
  scope: LocalProjectScope;
  connection: MapsConnection;
  item: LocalRunAdmission["prepared"][number];
  expected: ProviderRequest;
  quoteHash: string;
  providerPriceVersion: string;
  capability: LocalCapability;
  clock: () => Date;
}) {
  async function custody(request: PricedRequest) {
    if (request !== input.item.grant.pricedRequest)
      throw new Error("Original Maps grant is required.");
    assertMapsPricedRequest(
      request,
      input.expected,
      input.connection.projectId,
      input.providerPriceVersion,
    );
    return input.db.$transaction(async (tx) => {
      const scope = await localProjectScope(
        tx,
        input.scope.context,
        input.scope.project.publicId,
        "update",
      );
      if (scope.actor.id !== input.scope.actor.id) throw new Error("Maps actor changed.");
      const current = await readMapsConnection(tx, scope.project.id, input.connection.publicId);
      sameMapsConnection(input.connection, current);
      const item = await tx.localMeasurementRunItem.findFirst({
        where: { id: input.item.itemId, projectId: scope.project.id },
      });
      if (
        !item ||
        item.operationKey !== input.item.key ||
        item.preparedAttemptId !== input.item.grant.attemptId ||
        item.preparedLeaseId !== input.item.grant.leaseId ||
        item.requestHash !== localRequestHash(input.expected)
      )
        throw new Error("Maps prepared custody changed.");
      const record = submissionRecordSchema.parse(item.record);
      if (
        record.status !== "unknown_acceptance" ||
        record.attemptId !== input.item.grant.attemptId ||
        record.outcome ||
        record.settlementRecorded ||
        record.cancellationRequested
      )
        throw new Error("Original Maps attempt is no longer dispatchable.");
      await assertLocalCustody(tx, item, record);
      await assertLocalPossibleSend(tx, item);
      const run = await tx.localMeasurementRun.findFirst({
        where: { id: item.runId, projectId: scope.project.id },
      });
      if (!run || run.cancellationRequested) throw new Error("Original Maps run was cancelled.");
      const quote = localQuoteSchema.parse(run.quote);
      if (
        localQuoteHash(quote) !== input.quoteHash ||
        record.quoteHash !== input.quoteHash ||
        quote.providerPriceVersion !== input.providerPriceVersion
      )
        throw new Error("Original Maps quote changed.");
      return { connection: current, quote };
    });
  }
  return {
    assertPreparedBinding: async (request: PricedRequest, expected: ProviderRequest) => {
      if (localRequestHash(expected) !== localRequestHash(input.expected))
        throw new Error("Maps request changed.");
      assertMapsPricedRequest(
        request,
        expected,
        input.connection.projectId,
        input.providerPriceVersion,
      );
    },
    async submitPrepared(request: PricedRequest) {
      const { connection, quote } = await custody(request);
      const development = developmentMapsTransport({
        request: input.expected,
        operationId: input.item.itemId,
        receivedAt: input.clock(),
      });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        assertLocalQuote({
          quote,
          target: input.item.target,
          capability: input.capability,
          providerPriceVersion: input.providerPriceVersion,
          now: input.clock(),
        });
        const credentials = development ? null : mapsCredentials(connection);
        const response = await dispatchPricedRequest(
          request,
          development ?? strictFetch,
          controller.signal,
          credentials ? { secret: `${credentials.login}:${credentials.password}` } : null,
        );
        let data: unknown = null;
        try {
          data = await response.json();
        } catch {
          /* Missing response evidence remains unknown. */
        }
        return { data, ok: response.ok, dispatchEvidence: request };
      } finally {
        clearTimeout(timer);
      }
    },
    async assertDurableDispatchEvidence(evidence: PricedRequest, request: PricedRequest) {
      if (evidence !== request) throw new Error("Maps dispatch evidence changed.");
      await custody(request);
    },
  };
}
