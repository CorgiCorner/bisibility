import { ProviderCallError } from "@/lib/providers/call-error";
import { afterEach, describe, expect, it, vi } from "vitest";
import { aiProviderRequest, fetchObserved, fetchPrompt, VISIBILITY_PATH } from "./provider";
import { promptSchema, visibilitySchema } from "./schema";

vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllGlobals());
describe("AI provider request accounting", () => {
  it("settles the actual receipt before returning results", async () => {
    const settle = vi.fn();
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        status_code: 20000,
        cost: 0.103,
        tasks: [
          {
            id: "request-1",
            status_code: 20000,
            cost: 0.103,
            result: [{ total_count: 0, items: [] }],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await fetchObserved(
      {
        login: "test",
        password: "secret",
        usageObserver: { begin: vi.fn().mockResolvedValue("attempt-1"), settle },
      },
      visibilitySchema.parse({ brand: "Acme", domain: "acme.com", max_cost_cents: 20, limit: 3 }),
      "tag",
    );
    expect(result.costCents).toBeCloseTo(10.3);
    expect(settle).toHaveBeenCalledWith(
      "attempt-1",
      expect.objectContaining({ costCents: 10.3, providerRequestId: "request-1" }),
    );
    expect(fetch.mock.calls[0][0]).toContain("search_mentions/live");
  });
  it.each(["observed", "prompt"])(
    "preserves settled cost for malformed %s content",
    async (kind) => {
      const settle = vi.fn();
      const dispatched = vi.fn();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          Response.json({
            status_code: 20000,
            cost: 0.103,
            tasks: [
              {
                id: "malformed",
                status_code: 20000,
                cost: 0.103,
                result: [{ items: [{}], total_count: 1 }],
              },
            ],
          }),
        ),
      );
      const credentials = {
        login: "test",
        password: "secret",
        usageObserver: { begin: vi.fn().mockResolvedValue("attempt"), settle },
      };
      const target = { brand: "Acme", domain: "acme.com", max_cost_cents: 60 };
      const request =
        kind === "observed"
          ? fetchObserved(
              credentials,
              visibilitySchema.parse(target),
              "tag",
              Date.now() + 40_000,
              dispatched,
            )
          : fetchPrompt(
              credentials,
              promptSchema.parse({ ...target, prompt: "q" }),
              "gpt-4.1-mini",
              "tag",
              Date.now() + 40_000,
              new Set(["gpt-4.1-mini"]),
              dispatched,
            );
      const error = await request.catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(ProviderCallError);
      expect(error).toMatchObject({ costCents: 10.3 });
      expect(dispatched).toHaveBeenCalledTimes(1);
      expect(settle).toHaveBeenCalledWith("attempt", expect.objectContaining({ costCents: 10.3 }));
    },
  );
  it("does not replay a request after ambiguous acceptance", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("connection lost"));
    const settle = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      aiProviderRequest(
        {
          login: "test",
          password: "secret",
          usageObserver: { begin: vi.fn().mockResolvedValue("attempt"), settle },
        },
        VISIBILITY_PATH,
        {},
      ),
    ).rejects.toThrow("usage could not be confirmed");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledWith(
      "attempt",
      expect.objectContaining({ costCents: null, failed: true }),
    );
  });
  it("does not start paid I/O after the aggregate deadline", async () => {
    const fetch = vi.fn();
    const begin = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      aiProviderRequest(
        { login: "test", password: "secret", usageObserver: { begin, settle: vi.fn() } },
        VISIBILITY_PATH,
        {},
        Date.now() - 1,
      ),
    ).rejects.toThrow("deadline");
    expect(fetch).not.toHaveBeenCalled();
    expect(begin).not.toHaveBeenCalled();
  });
  it("aborts the actual paid request at the aggregate deadline and keeps usage unknown", async () => {
    const settle = vi.fn();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            requestSignal = init.signal;
            init.signal.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      ),
    );
    await expect(
      aiProviderRequest(
        {
          login: "test",
          password: "secret",
          usageObserver: { begin: vi.fn().mockResolvedValue("deadline-attempt"), settle },
        },
        VISIBILITY_PATH,
        {},
        Date.now() + 20,
      ),
    ).rejects.toThrow("usage could not be confirmed");
    expect(requestSignal?.aborted).toBe(true);
    expect(settle).toHaveBeenCalledWith(
      "deadline-attempt",
      expect.objectContaining({ costCents: null, failed: true }),
    );
  });
  it("fails closed when provider omits cost evidence", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ status_code: 20000, tasks: [{ status_code: 20000, result: [] }] }),
        ),
    );
    await expect(
      aiProviderRequest({ login: "test", password: "secret" }, VISIBILITY_PATH, {}),
    ).rejects.toThrow("usage could not be confirmed");
  });
});
