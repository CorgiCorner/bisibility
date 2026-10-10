import { ProviderCallError } from "@/lib/providers/call-error";
import { afterEach, describe, expect, it, vi } from "vitest";

const capacity = vi.hoisted(() => ({ reserve: vi.fn(), assert: vi.fn() }));
vi.mock("@/lib/providers/live-capacity", () => ({
  reserveLiveResponseCapacity: capacity.reserve,
  assertLiveResponseCapacity: capacity.assert,
}));

import { aiProviderRequest, PROMPT_PATH, VISIBILITY_PATH } from "./provider";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("research shared live Responses capacity", () => {
  it("settles a delayed final fence as zero and keeps a thrown paid transport unknown", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const actual = await vi.importActual<typeof import("@/lib/providers/live-capacity")>(
      "@/lib/providers/live-capacity",
    );
    capacity.reserve.mockResolvedValue({ dispatchExpiresAt: Date.now() + 5000 });
    capacity.assert.mockImplementation(actual.assertLiveResponseCapacity);
    const settle = vi.fn();
    const fetch = vi.fn();
    const dispatch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const credentials = {
      login: "fixture",
      password: "fixture",
      usageObserver: {
        begin: vi.fn(async () => "native"),
        beforeDispatch: vi.fn(async () => {
          vi.setSystemTime(Date.now() + 6000);
        }),
        settle,
      },
    };
    await expect(
      aiProviderRequest(credentials, PROMPT_PATH, {}, Date.now() + 10000, dispatch),
    ).rejects.toMatchObject({ costCents: 0 });
    expect(settle).toHaveBeenCalledWith("native", {
      cached: false,
      failed: true,
      costCents: 0,
      quantity: 0,
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    credentials.usageObserver.beforeDispatch.mockResolvedValue(undefined);
    capacity.assert.mockImplementation(() => undefined);
    fetch.mockRejectedValue(new ProviderCallError("Thrown after fetch invocation", 0));
    await expect(
      aiProviderRequest(credentials, PROMPT_PATH, {}, Date.now() + 10000, dispatch),
    ).rejects.toMatchObject({ phase: "request" });
    expect(settle).toHaveBeenLastCalledWith("native", {
      cached: false,
      failed: true,
      costCents: null,
      quantity: null,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects missing provider auth before observation or transport", async () => {
    const begin = vi.fn();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      aiProviderRequest({ usageObserver: { begin, settle: vi.fn() } }, PROMPT_PATH, {}),
    ).rejects.toThrow();
    expect(begin).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reserves before observation and fences after the journal immediately before dispatch", async () => {
    const order: string[] = [];
    const reservation = { dispatchExpiresAt: Date.now() + 5000 };
    capacity.reserve.mockImplementation(async () => {
      order.push("capacity");
      return reservation;
    });
    capacity.assert.mockImplementation(() => order.push("capacity-fence"));
    const credentials = {
      login: "fictional",
      password: "fictional",
      usageObserver: {
        begin: vi.fn(async () => {
          order.push("journal");
          return "native-id";
        }),
        beforeDispatch: vi.fn(async () => {
          order.push("native-fence");
        }),
        settle: vi.fn(),
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        order.push("fetch");
        return Response.json({
          status_code: 20000,
          cost: 0.01,
          tasks: [{ status_code: 20000, cost: 0.01, result: [] }],
        });
      }),
    );
    await aiProviderRequest(
      credentials,
      PROMPT_PATH,
      {},
      Date.now() + 10000,
      () => {
        order.push("dispatch");
      },
      "project",
    );
    expect(order).toEqual([
      "capacity",
      "journal",
      "native-fence",
      "capacity-fence",
      "dispatch",
      "fetch",
    ]);
    expect(capacity.reserve).toHaveBeenCalledWith(credentials, "project");
    expect(capacity.assert).toHaveBeenCalledWith(reservation);
  });
  it("shared capacity denial does not begin the native observer or invoke paid transport", async () => {
    capacity.reserve.mockRejectedValue(new ProviderCallError("Shared capacity unavailable", 0));
    const begin = vi.fn();
    const fetch = vi.fn();
    const dispatched = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      aiProviderRequest(
        { login: "fixture", password: "fixture", usageObserver: { begin, settle: vi.fn() } },
        PROMPT_PATH,
        {},
        Date.now() + 10000,
        dispatched,
      ),
    ).rejects.toMatchObject({ costCents: 0 });
    expect(begin).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(dispatched).not.toHaveBeenCalled();
  });
  it("does not reserve live Responses capacity for observed visibility", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status_code: 20000,
          cost: 0.01,
          tasks: [{ status_code: 20000, cost: 0.01, result: [] }],
        }),
      ),
    );
    await aiProviderRequest({ login: "fixture", password: "fixture" }, VISIBILITY_PATH, {});
    expect(capacity.reserve).not.toHaveBeenCalled();
    expect(capacity.assert).not.toHaveBeenCalled();
  });
});
