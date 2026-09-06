import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  connect: vi.fn(),
  connectionOptions: vi.fn(),
  workflowStart: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { projectDefaults: { findUnique: vi.fn() } },
}));
vi.mock("./connection-options", () => ({
  temporalConnectionOptions: mocks.connectionOptions,
  temporalSdkConnectionOptions: ({ tlsSource: _tlsSource, ...options }: Record<string, unknown>) =>
    options,
}));
vi.mock("@temporalio/client", () => ({
  Client: class {
    connection: { close: () => Promise<void> };
    workflow = { start: mocks.workflowStart };

    constructor(options: { connection: { close: () => Promise<void> } }) {
      this.connection = options.connection;
    }
  },
  Connection: { connect: mocks.connect },
}));

const starterNames = [
  "startRankCheckWorkflow",
  "startTrafficSyncWorkflow",
  "startSearchInsightsBackfillWorkflow",
  "startSearchInsightsSyncWorkflow",
  "startAlertDeliveryWorkflow",
  "startWelcomeFollowupWorkflow",
  "getSchedulerTemporalClient",
] as const;

type StarterName = (typeof starterNames)[number];

async function loadStarters(): Promise<Record<StarterName, () => Promise<unknown>>> {
  const [client, traffic, searchInsights, alertDelivery, welcomeEmail, scheduler] =
    await Promise.all([
      import("./client"),
      import("./traffic-client"),
      import("./search-insights-client"),
      import("./alert-delivery-client"),
      import("./welcome-email-client"),
      import("./scheduler-client"),
    ]);

  return {
    getSchedulerTemporalClient: scheduler.getSchedulerTemporalClient,
    startAlertDeliveryWorkflow: () => alertDelivery.startAlertDeliveryWorkflow("alert_1"),
    startRankCheckWorkflow: () => client.startRankCheckWorkflow({ keywordId: "keyword_1" }),
    startSearchInsightsBackfillWorkflow: () =>
      searchInsights.startSearchInsightsBackfillWorkflow({
        projectId: "project_1",
        property: "sc-domain:example.com",
      }),
    startSearchInsightsSyncWorkflow: () =>
      searchInsights.startSearchInsightsSyncWorkflow({ projectId: "project_1" }),
    startTrafficSyncWorkflow: traffic.startTrafficSyncWorkflow,
    startWelcomeFollowupWorkflow: () => welcomeEmail.startWelcomeFollowupWorkflow("user_1"),
  };
}

describe.each(starterNames)("worker-owned engine guard: %s", (starterName) => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SCHEDULER_DRIVER", "worker");
    mocks.close.mockReset().mockResolvedValue(undefined);
    mocks.connect.mockReset().mockResolvedValue({ close: mocks.close });
    mocks.connectionOptions.mockReset().mockReturnValue({
      address: "engine.test:7233",
      tlsSource: "auto-no-api-key",
    });
    mocks.workflowStart.mockReset().mockResolvedValue({
      firstExecutionRunId: "run_1",
      workflowId: "workflow_1",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("rejects immediately without opening a socket or starting a timer", async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const { EngineOwnedByWorkerError } = await import("@/lib/scheduler/driver");
    const starter = (await loadStarters())[starterName];

    await expect(starter()).rejects.toBeInstanceOf(EngineOwnedByWorkerError);

    expect(mocks.connectionOptions).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reaches the socket path when the driver is temporal", async () => {
    vi.stubEnv("SCHEDULER_DRIVER", "temporal");
    const connectionFailure = new Error("connect path reached");
    mocks.connect.mockRejectedValue(connectionFailure);
    const starter = (await loadStarters())[starterName];

    await expect(starter()).rejects.toBe(connectionFailure);
    expect(mocks.connectionOptions).toHaveBeenCalledOnce();
    expect(mocks.connect).toHaveBeenCalledOnce();
  });
});

describe("worker-owned engine client memoisation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not cache the configuration refusal", async () => {
    vi.resetModules();
    vi.stubEnv("SCHEDULER_DRIVER", "worker");
    mocks.connect.mockReset().mockResolvedValue({ close: mocks.close });
    mocks.connectionOptions.mockReset().mockReturnValue({
      address: "engine.test:7233",
      tlsSource: "auto-no-api-key",
    });
    const { EngineOwnedByWorkerError } = await import("@/lib/scheduler/driver");
    const { getTemporalClient } = await import("./client");

    await expect(getTemporalClient()).rejects.toBeInstanceOf(EngineOwnedByWorkerError);
    vi.stubEnv("SCHEDULER_DRIVER", "temporal");
    await expect(getTemporalClient()).resolves.toBeDefined();

    expect(mocks.connectionOptions).toHaveBeenCalledOnce();
    expect(mocks.connect).toHaveBeenCalledOnce();
  });
});
