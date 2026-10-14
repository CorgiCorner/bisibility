import { Prisma } from "@/lib/generated/prisma/client";
import { buildProviderTag } from "@/lib/provider-usage/tag";
import { formatQuantity } from "@usagekit/core";
import type { ProviderRequest } from "@usagekit/providers";
import type { LocalHostPorts } from "./context";
import type { LocalNormalizationPort } from "./evidence-types";

type FixturePortsInput = {
  clock: () => Date;
  seed: { project: { id: string } };
  connection: { id: string; provider: string };
  keyword: { text: string };
  credentialVersion: string;
  capability: LocalHostPorts["adapter"]["capability"];
  providerPriceVersion: string;
  nativeAmount: string;
  request: ProviderRequest;
  operationId: string;
  counters: { submissions: number; collections: number };
};
export function createFixturePorts({
  clock,
  seed,
  connection,
  keyword,
  credentialVersion,
  capability,
  providerPriceVersion,
  nativeAmount,
  request,
  operationId,
  counters,
}: FixturePortsInput): LocalHostPorts {
  return {
    clock,
    policy: {
      capture: async (_tx, { keyword: row }) => ({
        keywordRevision: `fixture-keyword:${row.id}`,
        policyRevision: "fixture-policy-v1",
      }),
      assertCurrent: async (_tx, { keyword: row, target }) => {
        if (
          target.keywordRevision !== `fixture-keyword:${row.id}` ||
          target.policyRevision !== "fixture-policy-v1"
        )
          throw new Error("Synthetic policy revision changed.");
      },
    },
    activation: {
      assertRegistered: async (_tx, supplied) => {
        if (supplied !== capability) throw new Error("Unregistered synthetic capability.");
      },
      verifyConsent: async (_tx, input) =>
        input.operations.map(({ targetKey, operationKey }) => {
          const context = {
            correlationId: operationKey,
            feature: "local_scan" as const,
            projectId: seed.project.id,
            source: "app" as const,
            trigger: "manual" as const,
          };
          return {
            targetKey,
            binding: {
              projectId: seed.project.id,
              connectionId: connection.id,
              provider: connection.provider,
              credentialVersion,
              unit: "cents" as const,
              estimate: { cents: nativeAmount, units: "1" },
              attribution: {
                context,
                tag: buildProviderTag({ context, instanceSlug: "fixture" }),
              },
            },
          };
        }),
      assertPreparedTaskset: async (_tx, input) => {
        const total = input.requests.reduce((sum, priced) => {
          if (
            priced.admission.outcome !== "reserved" ||
            priced.admission.operation.providerPriceVersion !== input.quote.providerPriceVersion
          )
            throw new Error("Current price differs from accepted quote.");
          const cents = priced.estimate.find(({ unit }) => unit === "cents");
          if (!cents) throw new Error("Exact current native estimate missing.");
          return sum.plus(formatQuantity(cents));
        }, new Prisma.Decimal(0));
        if (
          !total.equals(
            input.quote.nativeEstimates.find(({ unit }) => unit === "cents")?.amount ?? "-1",
          )
        )
          throw new Error("Accepted whole-selection amount changed.");
      },
    },
    adapter: {
      capability,
      providerPriceVersion,
      buildRequest: ({ target, point }) => ({
        ...structuredClone(request),
        body: [
          {
            keyword: keyword.text,
            location_coordinate: `${point.coordinate.latitude},${point.coordinate.longitude}`,
            language_code: target.language,
            device: target.device,
            depth: target.cutoff,
            priority: 1,
          },
        ],
      }),
      assertPreparedQuote: async (priced) => {
        if (priced.matched.operation === "unknown" || priced.matched.operation.id !== operationId)
          throw new Error("Priced operation changed.");
      },
      submit: async () => {
        counters.submissions += 1;
        return {
          acceptance: "accepted",
          taskIds: ["synthetic-task"],
          receivedAt: clock().toISOString(),
          usage: {
            cached: false,
            costCents: new Prisma.Decimal(nativeAmount).toNumber(),
            quantity: 1,
            failed: false,
            providerRequestId: "synthetic-native",
          },
        };
      },
      assertRetrieval: async () => {
        throw new Error("Host wrapper must use canonical custody retrieval.");
      },
      collect: async (taskIds) => {
        counters.collections += 1;
        return {
          taskIds,
          observedAt: "2026-10-01T10:00:00.000Z",
          payload: { synthetic: true },
          completeness: "complete",
          completeThrough: 10,
        };
      },
    },
  };
}
export function createFixtureNormalizer(clock: () => Date): LocalNormalizationPort {
  return {
    normalize: async ({ record, result, target }) => {
      if (target.surface !== "web_serp")
        throw new Error("Fixture is not a product Maps/Finder implementation.");
      return {
        provider: record.provider,
        surface: "web_serp",
        engine: "google",
        completeness: result.completeness === "complete" ? "complete" : "unknown",
        configuredScope: {
          location: "Synthetic point seed",
          language: target.language,
          device: target.device,
        },
        executedAt: clock(),
        requestPolicy: {
          depth: target.cutoff,
          stopOnMatch: false,
          forcedAiOverview: false,
          evidence: {
            version: 1,
            adapterVersion: record.adapterVersion,
            observedAt: result.observedAt,
            requestedAt: null,
            targetRevision: record.targetKey,
            policyRevision: target.policyRevision,
            completeThrough: { local_pack: result.completeThrough },
          },
        },
        items: [
          {
            resultKind: "local_pack",
            rankScale: "pack_slot",
            promotion: "organic",
            blockPosition: 1,
            positionInBlock: 3,
            observedAt: result.observedAt ? new Date(result.observedAt) : null,
            businessName: "Synthetic business",
            cid: "18446744073709551615",
            rawFragment: { synthetic: true },
          },
        ],
      };
    },
  };
}
