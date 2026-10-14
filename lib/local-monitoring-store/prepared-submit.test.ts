import { executionFixture } from "@/lib/local-monitoring/execution.test-fixture";
import { localFixtureNow } from "@/lib/local-monitoring/fixtures";
import { localQuoteHash } from "@/lib/local-monitoring/quote";
import { executionTargetKey, operationKey } from "@/lib/local-monitoring/target-key";
import { describe, expect, it } from "vitest";
import { submitPreparedLocalItem } from "./prepared-submit";

describe("joined Local first-send boundary", () => {
  async function preparedFixture() {
    const f = executionFixture();
    const key = operationKey(f.scope);
    await f.store.claim({
      key,
      scope: f.scope,
      targetKey: executionTargetKey(f.target),
      quoteHash: localQuoteHash(f.quote),
      provider: f.adapter.capability.provider,
      adapterVersion: f.adapter.capability.adapterVersion,
      providerPriceVersion: f.adapter.providerPriceVersion,
    });
    const input = {
      key,
      target: f.target,
      quote: f.quote,
      request: f.adapter.buildRequest({ target: f.target, point: f.point, quote: f.quote }),
      store: f.store,
      journal: f.journal,
      adapter: f.adapter,
      clock: () => localFixtureNow,
    };
    return { f, key, input };
  }
  it("keeps a rejected beforeDispatch claimed and never calls the provider", async () => {
    const f = executionFixture();
    const key = operationKey(f.scope);
    await f.store.claim({
      key,
      scope: f.scope,
      targetKey: executionTargetKey(f.target),
      quoteHash: localQuoteHash(f.quote),
      provider: f.adapter.capability.provider,
      adapterVersion: f.adapter.capability.adapterVersion,
      providerPriceVersion: f.adapter.providerPriceVersion,
    });
    f.journal.beforeDispatch = async () => {
      throw new Error("Synthetic current activation denied");
    };
    await expect(
      submitPreparedLocalItem({
        key,
        target: f.target,
        quote: f.quote,
        request: f.adapter.buildRequest({ target: f.target, point: f.point, quote: f.quote }),
        store: f.store,
        journal: f.journal,
        adapter: f.adapter,
        clock: () => localFixtureNow,
      }),
    ).rejects.toThrow("activation denied");
    expect(await f.store.read(key)).toMatchObject({
      status: "claimed",
      attemptId: null,
      version: 0,
    });
    expect(f.state.submitCalls).toBe(0);
    expect(f.store.events).toEqual([]);
  });
  it("preserves genuine uncertainty after a committed fence but lost commit response", async () => {
    const { f, key, input } = await preparedFixture();
    f.journal.beforeDispatch = async (attemptId) => {
      await f.store.apply(key, 0, { kind: "possible_send", attemptId });
      throw new Error("Synthetic commit response lost");
    };
    await expect(submitPreparedLocalItem(input)).rejects.toThrow("commit response lost");
    expect(await f.store.read(key)).toMatchObject({ status: "unknown_acceptance", attemptId: key });
    await expect(submitPreparedLocalItem(input)).rejects.toThrow("Fresh admitted");
    expect(f.state.submitCalls).toBe(0);
  });
  it("does not send without the exact committed original projection", async () => {
    const { f, key, input } = await preparedFixture();
    f.journal.beforeDispatch = async () => {
      await f.store.apply(key, 0, { kind: "possible_send", attemptId: "foreign" });
    };
    await expect(submitPreparedLocalItem(input)).rejects.toThrow("projection is unavailable");
    expect(f.state.submitCalls).toBe(0);
  });
  it("retains possible-send after the quote expires at the final synchronous guard", async () => {
    const { f, key, input } = await preparedFixture();
    f.journal.beforeDispatch = async (attemptId) => {
      await f.store.apply(key, 0, { kind: "possible_send", attemptId });
      input.clock = () => new Date("2026-10-12T14:00:00.000Z");
    };
    await expect(submitPreparedLocalItem(input)).rejects.toThrow();
    expect(await f.store.read(key)).toMatchObject({ status: "unknown_acceptance", attemptId: key });
    expect(f.state.submitCalls).toBe(0);
  });
});
