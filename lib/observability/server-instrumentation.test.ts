import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captureRequestError: vi.fn(),
  getActiveSpan: vi.fn(),
}));
const serverConfigLoaded = vi.hoisted(() => vi.fn());
const edgeConfigLoaded = vi.hoisted(() => vi.fn());
const sdkModuleLoaded = vi.hoisted(() => vi.fn());
const bakedRuntimeEnv = vi.hoisted(() => ({ sentryDsn: undefined as string | undefined }));

vi.mock("@sentry/nextjs", () => {
  sdkModuleLoaded();
  return sentry;
});
vi.mock("../../sentry.server.config", () => {
  serverConfigLoaded();
  return {};
});
vi.mock("../../sentry.edge.config", () => {
  edgeConfigLoaded();
  return {};
});
vi.mock("../../lib/deployment/canonical-mcp-origin", () => ({
  assertCanonicalHostedMcpOrigin: vi.fn(),
}));
vi.mock("../../lib/deployment/deprecated-inspection-budget", () => ({
  warnDeprecatedInspectionDailyBudget: vi.fn(),
}));
vi.mock("../../lib/deployment/runtime-env.generated", () => {
  if (bakedRuntimeEnv.sentryDsn) process.env.SENTRY_DSN = bakedRuntimeEnv.sentryDsn;
  return {};
});
vi.mock("../../lib/data-migrations/startup", () => ({
  enforceMigrationsAtStartup: vi.fn(async () => {}),
}));

const ENV_KEYS = ["NEXT_RUNTIME", "SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"] as const;

// vi.doMock inside a test replaces the registry entry for the rest of the file, and a
// cached mocked module does not re-run its factory, so each test re-registers its own.
function reregisterModuleMocks() {
  vi.doMock("@sentry/nextjs", () => {
    sdkModuleLoaded();
    return sentry;
  });
  vi.doMock("../../sentry.server.config", () => {
    serverConfigLoaded();
    return {};
  });
  vi.doMock("../../sentry.edge.config", () => {
    edgeConfigLoaded();
    return {};
  });
  vi.doMock("../../lib/deployment/runtime-env.generated", () => {
    if (bakedRuntimeEnv.sentryDsn) process.env.SENTRY_DSN = bakedRuntimeEnv.sentryDsn;
    return {};
  });
}

describe("server instrumentation", () => {
  let snapshots: Record<string, string | undefined>;

  beforeEach(async () => {
    bakedRuntimeEnv.sentryDsn = undefined;
    snapshots = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    vi.resetModules();
    const { registerRequestDiagnosticSink } = await import("./request-diagnostics");
    registerRequestDiagnosticSink(undefined);
    reregisterModuleMocks();
    serverConfigLoaded.mockReset();
    edgeConfigLoaded.mockReset();
    sentry.captureRequestError.mockReset();
    sentry.getActiveSpan.mockReset();
    sdkModuleLoaded.mockReset();
  });

  afterEach(async () => {
    const { registerRequestDiagnosticSink } = await import("./request-diagnostics");
    registerRequestDiagnosticSink(undefined);
    for (const key of ENV_KEYS) {
      if (snapshots[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = snapshots[key];
      }
    }
  });

  it("does not load the reporting SDK on the server when no DSN is configured", async () => {
    process.env.NEXT_RUNTIME = "nodejs";

    const instrumentation = await import("../../instrumentation");
    await instrumentation.register();

    expect(serverConfigLoaded).not.toHaveBeenCalled();
    expect(sdkModuleLoaded).not.toHaveBeenCalled();
    const { setRequestDiagnosticAttribute } = await import("./request-diagnostics");
    setRequestDiagnosticAttribute("auth.oauth.error", "invalid_grant");
    expect(sentry.getActiveSpan).not.toHaveBeenCalled();
  });

  it("attributes diagnostics to each current request without replaying earlier attributes", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const { setRequestDiagnosticAttribute } = await import("./request-diagnostics");
    setRequestDiagnosticAttribute("auth.oauth.error", "unclassified");
    process.env.SENTRY_DSN = "https://public@example.com/1";
    const instrumentation = await import("../../instrumentation");
    await instrumentation.register();
    expect(sentry.getActiveSpan).not.toHaveBeenCalled();
    expect(sdkModuleLoaded).toHaveBeenCalledOnce();
    const first = { setAttribute: vi.fn() };
    const second = { setAttribute: vi.fn() };
    sentry.getActiveSpan.mockReturnValueOnce(first).mockReturnValueOnce(second);
    setRequestDiagnosticAttribute("auth.oauth.error", "invalid_grant");
    setRequestDiagnosticAttribute("auth.oauth.error", "invalid_client");
    expect(first.setAttribute).toHaveBeenCalledExactlyOnceWith("auth.oauth.error", "invalid_grant");
    expect(second.setAttribute).toHaveBeenCalledExactlyOnceWith(
      "auth.oauth.error",
      "invalid_client",
    );
    expect(sentry.getActiveSpan).toHaveBeenCalledTimes(2);
  });

  it("shares registration across module instances and preserves concurrent request contexts", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const instrumentationLayer = await import("./request-diagnostics");
    instrumentationLayer.setRequestDiagnosticAttribute("auth.oauth.error", "unclassified");
    process.env.SENTRY_DSN = "configured-for-test";
    const instrumentation = await import("../../instrumentation");
    await instrumentation.register();
    expect(sentry.getActiveSpan).not.toHaveBeenCalled();

    vi.resetModules();
    const routeLayer = await import("./request-diagnostics");
    expect(routeLayer.setRequestDiagnosticAttribute).not.toBe(
      instrumentationLayer.setRequestDiagnosticAttribute,
    );
    const first = { setAttribute: vi.fn() };
    const second = { setAttribute: vi.fn() };
    const contexts = new AsyncLocalStorage<typeof first>();
    sentry.getActiveSpan.mockImplementation(() => contexts.getStore());
    let releaseFirst: () => void = () => undefined;
    const secondRecorded = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    await Promise.all([
      contexts.run(first, async () => {
        await secondRecorded;
        instrumentationLayer.setRequestDiagnosticAttribute("auth.oauth.error", "invalid_grant");
      }),
      contexts.run(second, async () => {
        routeLayer.setRequestDiagnosticAttribute("auth.oauth.error", "invalid_client");
        releaseFirst();
      }),
    ]);
    expect(first.setAttribute).toHaveBeenCalledExactlyOnceWith("auth.oauth.error", "invalid_grant");
    expect(second.setAttribute).toHaveBeenCalledExactlyOnceWith(
      "auth.oauth.error",
      "invalid_client",
    );
    expect(sentry.getActiveSpan).toHaveBeenCalledTimes(2);
  });

  it.each(["nodejs", "edge"])(
    "disables an earlier sink without loading the SDK on %s without a DSN",
    async (runtime) => {
      const previousLayer = await import("./request-diagnostics");
      const staleSink = vi.fn();
      previousLayer.registerRequestDiagnosticSink(staleSink);
      vi.resetModules();
      process.env.NEXT_RUNTIME = runtime;
      const instrumentation = await import("../../instrumentation");
      await instrumentation.register();
      const routeLayer = await import("./request-diagnostics");
      previousLayer.setRequestDiagnosticAttribute("auth.oauth.error", "invalid_grant");
      routeLayer.setRequestDiagnosticAttribute("auth.oauth.error", "invalid_client");
      expect(staleSink).not.toHaveBeenCalled();
      expect(sentry.getActiveSpan).not.toHaveBeenCalled();
      expect(serverConfigLoaded).not.toHaveBeenCalled();
      expect(edgeConfigLoaded).not.toHaveBeenCalled();
      expect(sdkModuleLoaded).not.toHaveBeenCalled();
    },
  );

  it("reads the DSN only after the baked environment module has filled it in", async () => {
    process.env.NEXT_RUNTIME = "nodejs";

    // Platforms that expose env at build time only deliver the DSN through this module, so
    // a decision taken before it loads would silently disable reporting.
    bakedRuntimeEnv.sentryDsn = "https://public@example.ingest.sentry.io/1";
    vi.resetModules();
    reregisterModuleMocks();

    const instrumentation = await import("../../instrumentation");
    await instrumentation.register();

    expect(serverConfigLoaded).toHaveBeenCalledOnce();
  });

  it("loads the server reporting config when a DSN is configured", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.SENTRY_DSN = "https://public@example.ingest.sentry.io/1";

    const instrumentation = await import("../../instrumentation");
    await instrumentation.register();

    expect(serverConfigLoaded).toHaveBeenCalledOnce();
  });

  it("does not load the reporting SDK on the edge runtime without a DSN", async () => {
    process.env.NEXT_RUNTIME = "edge";

    const instrumentation = await import("../../instrumentation");
    await instrumentation.register();

    expect(edgeConfigLoaded).not.toHaveBeenCalled();
  });

  it("reports request errors only when a DSN is configured", async () => {
    const request = { headers: {}, method: "GET", path: "/app" };
    const context = { routePath: "/app", routeType: "render" };

    const withoutDsn = await import("../../instrumentation");
    await withoutDsn.onRequestError(new Error("boom"), request as never, context as never);

    expect(sentry.captureRequestError).not.toHaveBeenCalled();

    process.env.SENTRY_DSN = "https://public@example.ingest.sentry.io/1";
    vi.resetModules();

    const withDsn = await import("../../instrumentation");
    await withDsn.onRequestError(new Error("boom"), request as never, context as never);

    expect(sentry.captureRequestError).toHaveBeenCalledOnce();
  });
});
