import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/live-capacity", () => ({
  reserveLiveResponseCapacity: vi.fn(),
  assertLiveResponseCapacity: vi.fn(),
}));

import { ProviderCallError } from "@/lib/providers/call-error";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { aiProviderRequest, PROMPT_PATH } from "./provider";
import { aiUsageReceipt } from "./provider-receipt";

const task = { id: "fictional-task", status_code: 20000, cost: 0.02, result: [] };
afterEach(() => vi.unstubAllGlobals());
describe("Single-task AI cost receipts", () => {
  it.each([true, false])(
    "settles a consistent charged response success=%s from task.cost only",
    async (success) => {
      const settle = vi.fn();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json(
            {
              status_code: success ? 20000 : 40000,
              cost: 0.02,
              tasks: [{ ...task, status_code: success ? 20000 : 40000 }],
            },
            { status: success ? 200 : 422 },
          ),
        ),
      );
      const call = aiProviderRequest(
        {
          login: "fixture",
          password: "fictional",
          usageObserver: { begin: vi.fn(async () => "fictional-attempt"), settle },
        },
        PROMPT_PATH,
        { user_prompt: "fictional" },
      );
      if (success) expect(await call).toMatchObject({ costCents: 2 });
      else await expect(call).rejects.toMatchObject({ name: ProviderCallError.name, costCents: 2 });
      expect(settle).toHaveBeenCalledWith(
        "fictional-attempt",
        expect.objectContaining({
          costCents: 2,
          providerRequestId: "fictional-task",
          failed: !success,
        }),
      );
    },
  );
  it.each([0, -1, NaN, Infinity, 0.03, null])(
    "keeps conflicting/malformed envelope cost %s unknown",
    (cost) => {
      expect(
        aiUsageReceipt({ status_code: 20000, cost: cost as number, tasks: [task] }, { ok: true }),
      ).toMatchObject({ costCents: null, quantity: null });
    },
  );
  it.each([undefined, -1, NaN, Infinity])(
    "requires a valid task receipt, not only envelope cost (%s)",
    (cost) => {
      expect(
        aiUsageReceipt(
          { status_code: 20000, cost: 0.02, tasks: [{ ...task, cost }] },
          { ok: true },
        ),
      ).toMatchObject({ costCents: null, quantity: null });
    },
  );
  it("allows an omitted envelope total when the single task amount is valid", () => {
    expect(aiUsageReceipt({ status_code: 20000, tasks: [task] }, { ok: true })).toMatchObject({
      costCents: 2,
      quantity: 1,
    });
    expect(
      aiUsageReceipt({ status_code: 20000, tasks: [task, task] }, { ok: true }).costCents,
    ).toBeNull();
  });
  it("settles task cost once because it already includes model money_spent", () => {
    const result = {
      model_name: "gpt-4.1-mini-2025-04-14",
      money_spent: 0.0194,
      items: [],
    };
    expect(
      aiUsageReceipt(
        { status_code: 20000, cost: 0.02, tasks: [{ ...task, result: [result] }] },
        {
          ok: true,
        },
      ),
    ).toMatchObject({ costCents: 2, quantity: 1 });
  });
  it("records unknown usage and never returns a conflicting top-zero/task-positive charge as zero", async () => {
    const settle = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ status_code: 20000, cost: 0, tasks: [task] })),
    );
    await expect(
      aiProviderRequest(
        {
          login: "fixture",
          password: "fictional",
          usageObserver: { begin: vi.fn(async () => "fictional-attempt"), settle },
        },
        PROMPT_PATH,
        {},
      ),
    ).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    expect(settle).toHaveBeenCalledWith(
      "fictional-attempt",
      expect.objectContaining({ costCents: null, quantity: null }),
    );
  });
  it("bounds paid response bodies and leaves oversized receipts unknown", async () => {
    const settle = vi.fn();
    const dispatched = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("{}", { headers: { "content-length": String(2 * 1024 * 1024 + 1) } }),
      ),
    );
    await expect(
      aiProviderRequest(
        {
          login: "fixture",
          password: "fictional",
          usageObserver: { begin: vi.fn(async () => "fictional-attempt"), settle },
        },
        PROMPT_PATH,
        {},
        Date.now() + 10000,
        dispatched,
      ),
    ).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    expect(dispatched).toHaveBeenCalledOnce();
    expect(settle).toHaveBeenCalledWith(
      "fictional-attempt",
      expect.objectContaining({ costCents: null, quantity: null }),
    );
  });
});
