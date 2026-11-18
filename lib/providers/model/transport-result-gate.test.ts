import {
  result,
  unknownMoney,
  unknownUsage,
} from "@/lib/model-playground/contract-fixtures.test-support";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { generateModelResponse, type ModelGenerationInput } from "./transport";
import {
  assertNoUnexpectedFetch,
  generation,
  interceptedFetch,
  json,
} from "./transport.test-support";

const gate = vi.hoisted(() => ({ enabled: false }));
vi.mock("./transport-contract", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./transport-contract")>()),
  get MODEL_RESULT_EXTENSIONS_ENABLED() {
    return gate.enabled;
  },
}));
vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn(async () => ({ success: true })),
}));
const extensions = {
  consultedSources: { sources: [], total: null, omitted: null, truncated: false },
  citationTotals: { total: null, omitted: null },
  costEvidence: { providerReported: null, upstreamInference: null, localEstimate: null },
  routingAttemptCredentials: {
    version: 1 as const,
    completeness: "unknown" as const,
    attempts: [],
  },
};
const extensionKeys = Object.keys(extensions) as (keyof typeof extensions)[];
const requestId = "req_SyntheticResponse123";
function assertFailedSettlement(config: ModelGenerationInput) {
  const timestamp = new Date().toISOString();
  const expected = {
    version: 1,
    column: config.column,
    actualProviderId: null,
    actualModelId: null,
    providerRequestId: requestId,
    state: "unknown",
    failure: "invalid_response",
    startedAt: timestamp,
    finishedAt: timestamp,
    durationMs: 0,
    answer: null,
    truncation: { provider: false, application: false, citations: false },
    citations: [],
    usage: unknownUsage,
    providerCost: unknownMoney,
    paymentReceipt: null,
    rawEvidenceId: null,
  };
  expect(config.observer.beforeDispatch).toHaveBeenCalledExactlyOnceWith(config.operationKey);
  expect(config.observer.settle).toHaveBeenCalledExactlyOnceWith(config.operationKey, expected);
  const settled = vi.mocked(config.observer.settle).mock.calls[0][1];
  for (const key of extensionKeys) expect(Object.hasOwn(settled, key)).toBe(false);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
    expect.any(String),
    expect.objectContaining({ method: "POST" }),
  );
  expect(vi.mocked(config.observer.beforeDispatch).mock.invocationCallOrder[0]).toBeLessThan(
    fetchMock.mock.invocationCallOrder[0],
  );
  expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(config.observer.settle).mock.invocationCallOrder[0],
  );
}
let fetchMock: ReturnType<typeof interceptedFetch>;
beforeEach(() => {
  gate.enabled = false;
  fetchMock = interceptedFetch();
});
afterEach(() => {
  assertNoUnexpectedFetch();
  vi.unstubAllGlobals();
});

it.each(extensionKeys)(
  "N1 off refuses %s and settles failure evidence exactly once",
  async (key) => {
    const config = generation();
    config.normalize = () => ({
      ...result(),
      usage: { ...unknownUsage, completeness: "complete", inputTokens: 8, outputTokens: 3 },
      providerCost: {
        ...unknownMoney,
        amount: "0.20",
        certainty: "reported",
        basis: "provider_response",
      },
      [key]: extensions[key],
    });
    fetchMock.mockResolvedValueOnce(json(undefined, { headers: { "x-request-id": requestId } }));
    await expect(generateModelResponse(config)).rejects.toMatchObject({
      code: "invalid_response",
      message: "Model provider returned an invalid response.",
      dispatched: true,
      financialExposure: "unknown",
      requestId,
    });
    assertFailedSettlement(config);
  },
);
it.each(extensionKeys)(
  "N1 reports accounting_unknown if settling refused %s fails",
  async (key) => {
    const config = generation();
    config.normalize = () => ({ ...result(), [key]: extensions[key] });
    vi.mocked(config.observer.settle).mockRejectedValueOnce(new Error("Synthetic storage failure"));
    fetchMock.mockResolvedValueOnce(json(undefined, { headers: { "x-request-id": requestId } }));
    await expect(generateModelResponse(config)).rejects.toMatchObject({
      code: "accounting_unknown",
      message: "Model request accounting could not be confirmed.",
      dispatched: true,
      financialExposure: "unknown",
      requestId,
    });
    assertFailedSettlement(config);
  },
);
it.each(extensionKeys.flatMap((key) => [false, true].map((enabled) => ({ key, enabled }))))(
  "omits an own undefined $key with gate=$enabled",
  async ({ key, enabled }) => {
    gate.enabled = enabled;
    const config = generation();
    config.normalize = () => ({ ...result(), [key]: undefined });
    fetchMock.mockResolvedValueOnce(json());
    const response = await generateModelResponse(config);
    expect(response.state).toBe("completed");
    expect(response[key]).toBeUndefined();
    expect(Object.hasOwn(response, key)).toBe(false);
    expect(config.observer.settle).toHaveBeenCalledExactlyOnceWith(config.operationKey, response);
    expect(Object.hasOwn(vi.mocked(config.observer.settle).mock.calls[0][1], key)).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
  },
);
it.each(
  extensionKeys.flatMap((key) => [
    { key, visibility: "inherited" },
    { key, visibility: "non-enumerable" },
  ]),
)("N1 ignores $visibility $key", async ({ key, visibility }) => {
  const config = generation();
  config.normalize = () =>
    visibility === "inherited"
      ? Object.assign(Object.create({ [key]: extensions[key] }), result())
      : Object.defineProperty(result(), key, { value: extensions[key], enumerable: false });
  fetchMock.mockResolvedValueOnce(json());
  const response = await generateModelResponse(config);
  expect(response.state).toBe("completed");
  expect(Object.hasOwn(response, key)).toBe(false);
  expect(config.observer.settle).toHaveBeenCalledExactlyOnceWith(config.operationKey, response);
  expect(fetchMock).toHaveBeenCalledOnce();
});
it("C3 on forwards every extension unchanged", async () => {
  gate.enabled = true;
  const config = generation();
  config.normalize = () => ({ ...result(), ...extensions });
  fetchMock.mockResolvedValueOnce(json());
  expect(await generateModelResponse(config)).toMatchObject(extensions);
  expect(config.observer.settle).toHaveBeenCalledExactlyOnceWith(
    config.operationKey,
    expect.objectContaining(extensions),
  );
});
it.each([false, true])("C3 leaves absent keys unaffected with gate=%s", async (enabled) => {
  gate.enabled = enabled;
  const config = generation();
  fetchMock.mockResolvedValueOnce(json());
  const response = await generateModelResponse(config);
  for (const key of Object.keys(extensions)) expect(Object.hasOwn(response, key)).toBe(false);
  expect(config.observer.settle).toHaveBeenCalledExactlyOnceWith(config.operationKey, response);
});
it("ships enabled with the persistence migration", async () => {
  const contract =
    await vi.importActual<typeof import("./transport-contract")>("./transport-contract");
  expect(contract.MODEL_RESULT_EXTENSIONS_ENABLED).toBe(true);
});

it.each(extensionKeys.flatMap((key) => [false, true].map((enabled) => ({ key, enabled }))))(
  "snapshots the normalized $key getter once with gate=$enabled",
  async ({ key, enabled }) => {
    gate.enabled = enabled;
    let reads = 0;
    const config = generation();
    config.normalize = () =>
      Object.defineProperty(result(), key, {
        enumerable: true,
        get: () => (++reads === 1 ? undefined : extensions[key]),
      });
    fetchMock.mockResolvedValueOnce(json());
    const response = await generateModelResponse(config);
    expect(reads).toBe(1);
    expect(Object.hasOwn(response, key)).toBe(false);
    expect(config.observer.settle).toHaveBeenCalledExactlyOnceWith(config.operationKey, response);
  },
);

it.each([
  { consultedSources: { ...extensions.consultedSources, sources: {} } },
  { citationTotals: { total: -1, omitted: null } },
  { costEvidence: { ...extensions.costEvidence, localEstimate: 1 } },
])("settles malformed enabled extensions as failure exactly once: %j", async (invalid) => {
  gate.enabled = true;
  const config = generation();
  config.normalize = () =>
    ({
      ...result(),
      usage: { ...unknownUsage, completeness: "complete", inputTokens: 8, outputTokens: 3 },
      providerCost: {
        ...unknownMoney,
        amount: "0.20",
        certainty: "reported",
        basis: "provider_response",
      },
      ...invalid,
    }) as never;
  fetchMock.mockResolvedValueOnce(json(undefined, { headers: { "x-request-id": requestId } }));
  await expect(generateModelResponse(config)).rejects.toMatchObject({
    code: "invalid_response",
    dispatched: true,
  });
  assertFailedSettlement(config);
});

it("parses the same enabled snapshot that was inspected for extensions", async () => {
  gate.enabled = true;
  let reads = 0;
  const config = generation();
  config.normalize = () =>
    Object.defineProperty(result(), "costEvidence", {
      enumerable: true,
      get: () => (++reads === 1 ? extensions.costEvidence : "changed-after-read"),
    });
  fetchMock.mockResolvedValueOnce(json());
  const response = await generateModelResponse(config);
  expect(reads).toBe(1);
  expect(response.costEvidence).toEqual(extensions.costEvidence);
  expect(config.observer.settle).toHaveBeenCalledExactlyOnceWith(config.operationKey, response);
});
