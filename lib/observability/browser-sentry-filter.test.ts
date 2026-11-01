import type { ErrorEvent } from "@sentry/nextjs";
import { afterEach, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ init: vi.fn(), captureRouterTransitionStart: vi.fn() }));
vi.mock("@sentry/nextjs", () => sdk);

afterEach(() => vi.unstubAllEnvs());

it("filters injected frames through browser beforeSend and retains app errors", async () => {
  vi.resetModules();
  sdk.init.mockClear();
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://example.com/1");
  const { errorReportingReady } = await import("@/instrumentation-client");
  await errorReportingReady;
  expect(sdk.init).toHaveBeenCalledOnce();
  const beforeSend = sdk.init.mock.calls[0][0].beforeSend as (
    event: ErrorEvent,
  ) => ErrorEvent | null;
  const injected: ErrorEvent = {
    type: undefined,
    exception: {
      values: [{ stacktrace: { frames: [{ filename: "app:///frame_ant/frame_ant.js" }] } }],
    },
  };
  const app: ErrorEvent = {
    type: undefined,
    exception: { values: [{ stacktrace: { frames: [{ filename: "/_next/app.js" }] } }] },
  };
  expect(beforeSend(injected)).toBeNull();
  expect(beforeSend(app)).toBe(app);
});
