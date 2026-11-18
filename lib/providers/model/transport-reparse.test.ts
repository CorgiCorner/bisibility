import { result } from "@/lib/model-playground/contract-fixtures.test-support";
import { modelColumnResultSchema } from "@/lib/model-playground/types";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { generateModelResponse } from "./transport";
import {
  assertNoUnexpectedFetch,
  generation,
  interceptedFetch,
  json,
} from "./transport.test-support";

const fit = vi.hoisted(() => ({ fallback: false }));
vi.mock("@/lib/model-playground/result-budget", () => ({
  fitModelResultSources: (value: unknown) => (fit.fallback ? null : value),
}));
vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn(async () => ({ success: true })),
}));
beforeEach(() => {
  interceptedFetch().mockResolvedValueOnce(json());
});
afterEach(() => {
  assertNoUnexpectedFetch();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([false, true])(
  "re-parses fitted/fallback results before one settle: fallback=%s",
  async (fallback) => {
    fit.fallback = fallback;
    const config = generation();
    config.normalize = () => result();
    const parse = modelColumnResultSchema.parse.bind(modelColumnResultSchema);
    let calls = 0;
    vi.spyOn(modelColumnResultSchema, "parse").mockImplementation((value) => {
      if (++calls === 2) throw new Error("Synthetic result-level invariant");
      return parse(value);
    });
    vi.mocked(config.observer.settle).mockImplementation(async (_key, value) => {
      parse(value);
    });
    await expect(generateModelResponse(config)).rejects.toMatchObject({
      code: "invalid_response",
      dispatched: true,
    });
    expect(calls).toBe(2);
    expect(config.observer.settle).toHaveBeenCalledExactlyOnceWith(
      config.operationKey,
      expect.objectContaining({ failure: "invalid_response", state: "unknown" }),
    );
    expect(fetch).toHaveBeenCalledOnce();
  },
);
