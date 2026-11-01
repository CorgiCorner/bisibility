import { dataForSeoAccountAdapter } from "@/lib/providers/account-health/dataforseo";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PROBE_DEADLINE_MS, PROBE_LEASE_MS, runAccountProbe } from "./probe";

const gate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/providers/rate-limit", () => ({ consumeProviderLimit: gate }));
const credentials = { login: "fixture", password: "fixture" };
const input = {
  adapter: dataForSeoAccountAdapter,
  credentials,
  projectId: "project",
  provider: "dataforseo",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("does not send when the provider gate is unavailable or cooling down", async () => {
  gate.mockRejectedValueOnce(new Error("offline"));
  expect((await runAccountProbe(input)).fact).toMatchObject({
    kind: "failure",
    code: "provider_transient",
  });
  gate.mockResolvedValueOnce({ success: false, resetAt: Date.now() + 3_600_000 });
  expect((await runAccountProbe(input)).retryAt?.getTime()).toBeGreaterThan(Date.now() + 3_590_000);
  expect(fetch).not.toHaveBeenCalled();
});
it("never sends after a rate gate finishes beyond the deadline", async () => {
  vi.useFakeTimers();
  let release!: (value: unknown) => void;
  gate.mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  const checking = runAccountProbe(input);
  await vi.advanceTimersByTimeAsync(PROBE_DEADLINE_MS);
  expect(await checking).toMatchObject({
    timedOut: true,
    fact: { kind: "failure", code: "provider_transient" },
  });
  release({ success: true });
  await Promise.resolve();
  expect(fetch).not.toHaveBeenCalled();
  expect(PROBE_LEASE_MS).toBeGreaterThan(PROBE_DEADLINE_MS + 10_000);
});
it("sends only the account endpoint and keeps provider retry-after", async () => {
  gate.mockResolvedValue({ success: true });
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ status_code: 42900 }), {
      status: 429,
      headers: { "retry-after": "7200" },
    }),
  );
  const result = await runAccountProbe(input);
  expect(result.fact).toMatchObject({
    kind: "failure",
    code: "provider_rate_limited",
    retryAfterMs: 7_200_000,
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
    "https://api.dataforseo.com/v3/appendix/user_data",
  );
});
