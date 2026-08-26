import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captureRequestError: vi.fn(),
}));
const serverConfigLoaded = vi.hoisted(() => vi.fn());
const edgeConfigLoaded = vi.hoisted(() => vi.fn());
const bakedRuntimeEnv = vi.hoisted(() => ({ sentryDsn: undefined as string | undefined }));

vi.mock("@sentry/nextjs", () => sentry);
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

  beforeEach(() => {
    bakedRuntimeEnv.sentryDsn = undefined;
    snapshots = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    vi.resetModules();
    reregisterModuleMocks();
    serverConfigLoaded.mockReset();
    edgeConfigLoaded.mockReset();
    sentry.captureRequestError.mockReset();
  });

  afterEach(() => {
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
  });

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
