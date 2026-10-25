import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createGscUrlInspectionSession } from "./gsc-inspection";

const creds = { apiKey: "fixture-refresh", login: "sc-domain:example.com" };
const input = { property: creds.login, url: "https://example.com/page" };
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("GOOGLE_CLIENT_ID", "fixture-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture-secret");
  vi.stubEnv("BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED", "1");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each(["token headers", "token body", "inspection headers", "inspection body"])(
  "bounds a stalled %s, aborts its transport and makes no second inspection",
  async (phase) => {
    let release = () => {};
    let transportSignal: AbortSignal | null | undefined;
    const pending = (signal: AbortSignal | null | undefined, value: unknown) =>
      new Promise<unknown>((resolve, reject) => {
        transportSignal = signal;
        release = () => resolve(value);
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const token = url.includes("oauth2.googleapis.com");
        const stage = token ? "token" : "inspection";
        const payload = token ? { access_token: "fixture-access" } : {};
        if (phase === `${stage} headers`) return pending(init?.signal, Response.json(payload));
        if (phase === `${stage} body`)
          return { ok: true, json: () => pending(init?.signal, payload) };
        return Response.json(payload);
      }),
    );
    const session = await createGscUrlInspectionSession(creds);
    let settled = false;
    const result = session.inspectUrl(input).then(
      () => {
        settled = true;
        return null;
      },
      (error: unknown) => {
        settled = true;
        return error;
      },
    );
    try {
      await vi.advanceTimersByTimeAsync(30_000);
      expect(settled).toBe(true);
      expect(await result).toBeInstanceOf(Error);
      expect(transportSignal?.aborted).toBe(true);
      expect(
        vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("index:inspect")),
      ).toHaveLength(phase.startsWith("token") ? 0 : 1);
    } finally {
      release();
      await result;
    }
  },
);

it("forwards a shared run signal through token refresh and inspection", async () => {
  const controller = new AbortController();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(
        url.includes("oauth2.googleapis.com") ? { access_token: "fixture-access" } : {},
      ),
    ),
  );
  const session = await createGscUrlInspectionSession(creds);
  await session.inspectUrl({ ...input, signal: controller.signal });
  expect(fetch).toHaveBeenCalledTimes(2);
  for (const [, init] of vi.mocked(fetch).mock.calls) expect(init?.signal).toBe(controller.signal);
});

it("does not start token refresh for an already expired run", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ access_token: "fixture-access" })),
  );
  const controller = new AbortController();
  const reason = new Error("fixture deadline");
  controller.abort(reason);
  const session = await createGscUrlInspectionSession(creds);
  await expect(session.inspectUrl({ ...input, signal: controller.signal })).rejects.toBe(reason);
  expect(fetch).not.toHaveBeenCalled();
});
