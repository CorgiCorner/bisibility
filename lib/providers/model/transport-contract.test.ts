import { result } from "@/lib/model-playground/contract-fixtures.test-support";
import { modelColumnResultSchema } from "@/lib/model-playground/types";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { generateModelResponse } from "./transport";
import {
  assertNoUnexpectedFetch,
  canary,
  generation,
  interceptedFetch,
  json,
} from "./transport.test-support";

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn(async () => ({ success: true })),
}));
let fetchMock: ReturnType<typeof interceptedFetch>;
beforeEach(() => {
  fetchMock = interceptedFetch();
});
afterEach(() => {
  assertNoUnexpectedFetch();
  vi.unstubAllGlobals();
});

it.each([null, "upstream/provider-a"])(
  "preserves reported upstream identity %s",
  async (actualProviderId) => {
    const config = generation();
    config.normalize = () => ({ ...result(), actualProviderId, actualModelId: "upstream/text-v2" });
    fetchMock.mockResolvedValueOnce(json());
    const completed = await generateModelResponse(config);
    expect(completed.actualProviderId).toBe(actualProviderId);
    expect(completed.actualModelId).toBe("upstream/text-v2");
    expect(completed.column).toEqual(config.column);
    expect(completed.column.connectionId).toMatch(/^conn_/);
    expect(config.observer.settle).toHaveBeenCalledExactlyOnceWith(config.operationKey, completed);
  },
);

it.each([undefined, "", "bad identity", { provider: "upstream" }, "a".repeat(257)])(
  "rejects unvalidated upstream identity without guessing: %s",
  async (actualProviderId) => {
    const config = generation();
    config.normalize = () => ({ ...result(), actualProviderId }) as never;
    fetchMock.mockResolvedValueOnce(json());
    await expect(generateModelResponse(config)).rejects.toMatchObject({
      code: "invalid_response",
      dispatched: true,
      financialExposure: "unknown",
    });
    expect(config.observer.settle).toHaveBeenCalledOnce();
    const evidence = vi.mocked(config.observer.settle).mock.calls[0][1];
    expect(modelColumnResultSchema.safeParse(evidence).success).toBe(true);
    expect(evidence.actualProviderId).toBeNull();
    expect(evidence.providerCost.amount).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  },
);

it.each(["http", "network", "normalizer", "cancel-before-io", "cancel-after-io"])(
  "settles current conservative result contract on %s without retry",
  async (kind) => {
    const config = generation();
    const controller = new AbortController();
    config.context.signal = controller.signal;
    if (kind === "http") fetchMock.mockResolvedValueOnce(json(undefined, { status: 503 }));
    else if (kind === "network") fetchMock.mockRejectedValueOnce(new Error(canary));
    else if (kind === "normalizer") {
      fetchMock.mockResolvedValueOnce(json());
      config.normalize = () => {
        throw new Error(canary);
      };
    } else if (kind === "cancel-before-io") {
      vi.mocked(config.observer.beforeDispatch).mockImplementationOnce(async () =>
        controller.abort(canary),
      );
    } else {
      fetchMock.mockImplementationOnce(async () => {
        controller.abort(canary);
        return json();
      });
    }
    const beforeIo = kind === "cancel-before-io";
    const error = await generateModelResponse(config).catch((error: unknown) => error);
    expect(error).toMatchObject({
      dispatched: !beforeIo,
      financialExposure: beforeIo ? "not_dispatched" : "unknown",
    });
    expect(config.observer.settle).toHaveBeenCalledOnce();
    const evidence = vi.mocked(config.observer.settle).mock.calls[0][1];
    expect(modelColumnResultSchema.safeParse(evidence).success).toBe(true);
    expect(evidence).toMatchObject({
      state: beforeIo ? "cancelled" : "unknown",
      actualProviderId: null,
      actualModelId: null,
      answer: null,
      usage: { completeness: "unknown", inputTokens: null },
      providerCost: { amount: null, certainty: "unknown" },
    });
    expect(JSON.stringify(evidence)).not.toContain(canary);
    expect(fetchMock).toHaveBeenCalledTimes(beforeIo ? 0 : 1);
  },
);
