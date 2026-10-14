import { frozenRequest } from "@/lib/measurement-definitions/canonical";
import type { DefinitionBinding } from "@/lib/measurement-definitions/model";
import { nativeDefinitionRequestProof } from "@/lib/measurement-definitions/worker-request-proof";
import { dataForSeoProvider } from "@/lib/providers/serp/dataforseo";
import { serpApiProvider } from "@/lib/providers/serp/serpapi";
import { locationForProvider } from "@/lib/rank-check/fallback-location";
import { admittedDefinitionSource } from "@/lib/rank-check/runs/definition.test-fixture";
import { serpRankLocation } from "@/lib/serp/location";
import type { ProviderRequest } from "@usagekit/providers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSerpProvider } from "./registry";
import type { SerpRankInput } from "./types";
import type { ProviderUsageObserver } from "./usage";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

type RankProviderId = "dataforseo" | "serpapi";
const providerIds: RankProviderId[] = ["dataforseo", "serpapi"];
function rankFixture(
  providerId: RankProviderId,
  scope: "country" | "city" | "city-fallback" = "country",
) {
  const source = admittedDefinitionSource("fixture-project", "fixture-keyword", "synthetic query");
  Object.assign(source.target.location, {
    kind: scope === "country" ? "country" : "city",
    gl: "us",
    hl: "en",
    countryCode: "US",
    primaryGeoCode: scope === "city" ? 12345 : null,
    primaryGeoName: scope === "country" ? "United States" : "Synthetic City",
    secondaryGeoName: scope === "country" ? "United States" : "Synthetic City, United States",
  });
  if (source.policy.defaults) source.policy.defaults.serpStopOnMatch = scope !== "country";
  const request = frozenRequest(source, providerId, 20);
  const binding: DefinitionBinding = {
    id: "fixture-binding",
    projectId: source.projectId,
    keywordId: source.keywordId,
    targetRevision: "fixture-target",
    policyRevision: "fixture-policy",
    owner: { rankCheckId: "fixture-check", executionKey: "fixture-execution", queuedTaskId: null },
    request,
    source,
    capturedAt: new Date(),
  };
  const input: SerpRankInput = {
    keyword: request.keyword,
    domain: request.domain,
    depth: request.depth,
    device: request.device,
    location: locationForProvider(
      providerId,
      serpRankLocation(request.location),
      request.location.kind === "city",
    ),
    stopOnMatch: request.stopOnMatch,
  };
  return { binding, input };
}

function proofObserver(binding: DefinitionBinding): ProviderUsageObserver {
  return {
    begin: vi.fn(async (input) => {
      nativeDefinitionRequestProof(binding, input?.request);
      return "synthetic-attempt";
    }),
    beforeDispatch: vi.fn(async () => {}),
    settle: vi.fn(async () => {}),
  };
}

describe("synthetic provider accounting receipts", () => {
  it.each(["dataforseo", "serpapi"] as const)(
    "%s fake rank retains the actual configured native request before fencing and settling zero usage",
    async (providerId) => {
      vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "1");
      const { binding, input } = rankFixture(providerId);
      const order: string[] = [];
      const observer: ProviderUsageObserver = {
        begin: vi.fn(async (input) => {
          expect(nativeDefinitionRequestProof(binding, input?.request)).toMatchObject({
            route: "live",
            requestedDepth: 20,
            ...(providerId === "dataforseo" ? { nativeDepth: 20 } : { pageStart: 0, pageSize: 10 }),
          });
          order.push("native-proof");
          return "synthetic-attempt";
        }),
        beforeDispatch: vi.fn(async () => {
          order.push("fence");
        }),
        settle: vi.fn(async () => {
          order.push("settle");
        }),
      };
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const result = await getSerpProvider(providerId).fetchRank({
        ...input,
        credentials: { usageObserver: observer },
      });
      expect(result.costCents).toBe(0);
      expect(order).toEqual(["native-proof", "fence", "settle"]);
      expect(observer.settle).toHaveBeenCalledWith("synthetic-attempt", {
        cached: false,
        failed: false,
        costCents: 0,
        quantity: 0,
        providerRequestId: "synthetic:synthetic-attempt",
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.observation).toMatchObject({
        completeness: "unknown",
        effectiveScope: null,
        requestPolicy: { evidence: { completeThrough: { organic_result: null } } },
      });
    },
  );

  it.each(
    providerIds.flatMap((providerId) =>
      (["country", "city", "city-fallback"] as const).map((scope) => ({ providerId, scope })),
    ),
  )(
    "$providerId fake $scope capture equals the actual credential-free live transport request",
    async ({ providerId, scope }) => {
      vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "1");
      const { binding, input } = rankFixture(providerId, scope);
      input.tag = "synthetic-request-tag";
      const captures: ProviderRequest[] = [];
      const observer: ProviderUsageObserver = {
        ...proofObserver(binding),
        begin: vi.fn(async (event) => {
          nativeDefinitionRequestProof(binding, event?.request);
          captures.push(event?.request as ProviderRequest);
          return "synthetic-attempt";
        }),
      };
      const body =
        providerId === "dataforseo"
          ? {
              cost: 0.001,
              status_code: 20000,
              tasks: [
                {
                  cost: 0.001,
                  status_code: 20000,
                  result: [
                    {
                      items: [
                        { type: "organic", rank_group: 1, url: "https://example.com/result" },
                      ],
                    },
                  ],
                },
              ],
            }
          : {
              search_metadata: { id: "fixture-request", status: "Success" },
              organic_results: [{ position: 1, link: "https://example.com/result" }],
            };
      const fetchMock = vi.fn(
        async () =>
          new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const credentials = {
        usageObserver: observer,
        login: "synthetic-login",
        password: "synthetic-password",
        apiKey: "synthetic-api-key",
      };
      await (providerId === "dataforseo" ? dataForSeoProvider : serpApiProvider).fetchRank({
        ...input,
        credentials,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await getSerpProvider(providerId).fetchRank({ ...input, credentials });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(captures).toHaveLength(2);
      expect(captures[1]).toEqual(captures[0]);
      expect(JSON.stringify(captures)).not.toMatch(
        /synthetic-(login|password|api-key)|authorization|api_key/iu,
      );
    },
  );

  it.each(
    providerIds.flatMap((providerId) =>
      (
        [
          "foreign keyword",
          "foreign location",
          "different device",
          "foreign native provider",
        ] as const
      ).map((mismatch) => ({ providerId, mismatch })),
    ),
  )(
    "$providerId refuses $mismatch before fencing, settlement, or a fake result",
    async ({ providerId, mismatch }) => {
      vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "1");
      const { binding, input } = rankFixture(providerId);
      if (mismatch === "foreign keyword") input.keyword = "foreign project query";
      if (mismatch === "foreign location")
        input.location = {
          ...input.location,
          primaryGeoName: "Foreign",
          secondaryGeoName: "Foreign",
          gl: "pl",
        };
      if (mismatch === "different device") input.device = "mobile";
      const admitted =
        mismatch === "foreign native provider"
          ? {
              ...binding,
              request: frozenRequest(
                binding.source,
                providerId === "serpapi" ? "dataforseo" : "serpapi",
                20,
              ),
            }
          : binding;
      const observer = proofObserver(admitted);
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      await expect(
        getSerpProvider(providerId).fetchRank({
          ...input,
          credentials: { usageObserver: observer },
        }),
      ).rejects.toMatchObject({ code: "measurement_definition_unavailable" });
      expect(observer.beforeDispatch).not.toHaveBeenCalled();
      expect(observer.settle).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(["depth", "stop on match", "tracked domain"] as const)(
    "DataForSEO refuses a mismatching %s in the actual native task",
    async (mismatch) => {
      vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "1");
      const { binding, input } = rankFixture("dataforseo", "city");
      if (mismatch === "depth") input.depth = 50;
      if (mismatch === "stop on match") input.stopOnMatch = false;
      if (mismatch === "tracked domain") input.domain = "example.org";
      const observer = proofObserver(binding);
      await expect(
        getSerpProvider("dataforseo").fetchRank({
          ...input,
          credentials: { usageObserver: observer },
        }),
      ).rejects.toMatchObject({ code: "measurement_definition_unavailable" });
      expect(observer.beforeDispatch).not.toHaveBeenCalled();
      expect(observer.settle).not.toHaveBeenCalled();
    },
  );

  it.each(
    providerIds.flatMap((providerId) =>
      (["credential header", "foreign endpoint"] as const).map((tampering) => ({
        providerId,
        tampering,
      })),
    ),
  )(
    "$providerId native proof refuses a $tampering without settling fake usage",
    async ({ providerId, tampering }) => {
      vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "1");
      const { binding, input } = rankFixture(providerId);
      const observer = proofObserver(binding);
      vi.mocked(observer.begin).mockImplementation(async (event) => {
        const request = event?.request as ProviderRequest;
        nativeDefinitionRequestProof(
          binding,
          tampering === "credential header"
            ? { ...request, headers: { ...request.headers, Authorization: "synthetic-auth" } }
            : { ...request, url: "https://example.org/search.json" },
        );
        throw new Error("Unexpected native proof acceptance");
      });
      await expect(
        getSerpProvider(providerId).fetchRank({
          ...input,
          credentials: { usageObserver: observer },
        }),
      ).rejects.toMatchObject({ code: "measurement_definition_unavailable" });
      expect(observer.beforeDispatch).not.toHaveBeenCalled();
      expect(observer.settle).not.toHaveBeenCalled();
    },
  );

  it.each(
    providerIds.flatMap((providerId) =>
      (["begin", "fence", "settlement"] as const).map((stage) => ({ providerId, stage })),
    ),
  )(
    "$providerId does not return usable fake rank results after $stage rejection",
    async ({ providerId, stage }) => {
      vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "1");
      const { binding, input } = rankFixture(providerId);
      const observer = proofObserver(binding);
      const failure = new Error(`Synthetic ${stage} refused`);
      if (stage === "begin") vi.mocked(observer.begin).mockRejectedValue(failure);
      if (stage === "fence")
        vi.mocked(
          observer.beforeDispatch as NonNullable<ProviderUsageObserver["beforeDispatch"]>,
        ).mockRejectedValue(failure);
      if (stage === "settlement") vi.mocked(observer.settle).mockRejectedValue(failure);
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      await expect(
        getSerpProvider(providerId).fetchRank({
          ...input,
          credentials: { usageObserver: observer },
        }),
      ).rejects.toBe(failure);
      if (stage === "begin") expect(observer.beforeDispatch).not.toHaveBeenCalled();
      if (stage === "settlement") expect(observer.settle).toHaveBeenCalledOnce();
      else expect(observer.settle).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("retains confirmed zero usage through the ordinary observer before returning fake results", async () => {
    vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "1");
    const order: string[] = [];
    const observer: ProviderUsageObserver = {
      begin: vi.fn(async () => {
        order.push("begin");
        return "synthetic-attempt";
      }),
      beforeDispatch: vi.fn(async () => {
        order.push("fence");
      }),
      settle: vi.fn(async () => {
        order.push("settle");
      }),
    };
    const provider = getSerpProvider("dataforseo");
    if (!provider.fetchBacklinksSummary) throw new Error("Missing backlinks capability");
    const result = await provider.fetchBacklinksSummary(
      { usageObserver: observer },
      { target: "example.com", includeSubdomains: true, targetScope: "site" },
    );
    expect(result.costCents).toBe(0);
    expect(order).toEqual(["begin", "fence", "settle"]);
    expect(observer.settle).toHaveBeenCalledWith(
      "synthetic-attempt",
      expect.objectContaining({
        costCents: 0,
        quantity: 0,
        failed: false,
        cached: false,
      }),
    );
  });

  it("does not return usable results when the observer cannot retain settlement", async () => {
    vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "1");
    const failure = new Error("synthetic settlement failed");
    const observer: ProviderUsageObserver = {
      begin: vi.fn(async () => "synthetic-attempt"),
      beforeDispatch: vi.fn(async () => undefined),
      settle: vi.fn(async () => {
        throw failure;
      }),
    };
    const provider = getSerpProvider("dataforseo");
    if (!provider.fetchBacklinksSummary) throw new Error("Missing backlinks capability");
    await expect(
      provider.fetchBacklinksSummary(
        { usageObserver: observer },
        { target: "example.com", includeSubdomains: true, targetScope: "site" },
      ),
    ).rejects.toBe(failure);
  });
});

it("cancels an admitted synthetic reservation when its dispatch fence refuses it", async () => {
  vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "1");
  const { binding, input } = rankFixture("serpapi");
  const failure = new Error("Synthetic dispatch refused");
  const observer = {
    ...proofObserver(binding),
    beforeDispatch: vi.fn(async () => {
      throw failure;
    }),
    cancel: vi.fn(async () => undefined),
  };
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    getSerpProvider("serpapi").fetchRank({ ...input, credentials: { usageObserver: observer } }),
  ).rejects.toBe(failure);
  expect(observer.cancel).toHaveBeenCalledExactlyOnceWith("synthetic-attempt");
  expect(observer.settle).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});
