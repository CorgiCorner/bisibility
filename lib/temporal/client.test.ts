import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  connect: vi.fn(),
  connectionOptions: vi.fn(),
  start: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./connection-options", () => ({
  temporalConnectionOptions: mocks.connectionOptions,
  temporalSdkConnectionOptions: ({ tlsSource: _tlsSource, ...options }: Record<string, unknown>) =>
    options,
}));
vi.mock("@temporalio/client", () => ({
  Client: class {
    connection: { close: () => Promise<void> };
    workflow = { start: mocks.start };

    constructor(options: { connection: { close: () => Promise<void> } }) {
      this.connection = options.connection;
    }
  },
  Connection: {
    connect: mocks.connect,
  },
}));

describe("Temporal client lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.close.mockReset().mockResolvedValue(undefined);
    mocks.connect.mockReset().mockResolvedValue({ close: mocks.close });
    mocks.connectionOptions.mockReset().mockReturnValue({
      address: "temporal.test:7233",
      connectTimeout: 2_000,
      tlsSource: "auto-no-api-key",
    });
    mocks.start.mockReset().mockResolvedValue({
      firstExecutionRunId: "temporal_run_1",
      workflowId: "workflow_1",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("does not resolve connection settings while importing the web client", async () => {
    mocks.connectionOptions.mockImplementation(() => {
      throw new Error("TEMPORAL_ADDRESS is required");
    });

    const client = await import("./client");

    expect(mocks.connectionOptions).not.toHaveBeenCalled();
    await expect(client.getTemporalClient()).rejects.toThrow("TEMPORAL_ADDRESS is required");
  });

  it("closes and clears the cached connection for one-shot commands", async () => {
    const { closeTemporalClient, getTemporalClient } = await import("./client");

    expect(await getTemporalClient()).toBe(await getTemporalClient());
    expect(mocks.connect).toHaveBeenCalledTimes(1);

    await closeTemporalClient();
    expect(mocks.close).toHaveBeenCalledTimes(1);

    await getTemporalClient();
    expect(mocks.connect).toHaveBeenCalledTimes(2);
    await closeTemporalClient();
    expect(mocks.close).toHaveBeenCalledTimes(2);
  });

  it("rejects with the same error during cooldown and reconnects after it elapses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2000-01-01T00:00:00.000Z"));
    const failure = Object.assign(new Error("unavailable"), { code: "ECONNREFUSED" });
    mocks.connect.mockRejectedValueOnce(failure).mockResolvedValueOnce({ close: mocks.close });
    const { closeTemporalClient, getTemporalClient } = await import("./client");

    await expect(getTemporalClient()).rejects.toBe(failure);
    await expect(getTemporalClient()).rejects.toBe(failure);
    expect(mocks.connect).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_000);
    await expect(getTemporalClient()).resolves.toBeDefined();
    expect(mocks.connect).toHaveBeenCalledTimes(2);

    await closeTemporalClient();
  });

  it("uses a validated cooldown override without sleeping", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2000-01-01T00:00:00.000Z"));
    vi.stubEnv("TEMPORAL_CONNECT_FAILURE_COOLDOWN_MS", "100");
    const failure = new Error("unavailable");
    mocks.connect.mockRejectedValueOnce(failure).mockResolvedValueOnce({ close: mocks.close });
    const { closeTemporalClient, getTemporalClient } = await import("./client");

    await expect(getTemporalClient()).rejects.toBe(failure);
    vi.advanceTimersByTime(99);
    await expect(getTemporalClient()).rejects.toBe(failure);
    vi.advanceTimersByTime(1);
    await expect(getTemporalClient()).resolves.toBeDefined();

    await closeTemporalClient();
  });

  it("rejects a malformed cooldown before dialling", async () => {
    vi.stubEnv("TEMPORAL_CONNECT_FAILURE_COOLDOWN_MS", "later");
    const { getTemporalClient } = await import("./client");

    await expect(getTemporalClient()).rejects.toThrow(
      "TEMPORAL_CONNECT_FAILURE_COOLDOWN_MS must be an integer",
    );
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it.each(["99", "30001"])("rejects an out-of-range cooldown of %s ms", async (value) => {
    vi.stubEnv("TEMPORAL_CONNECT_FAILURE_COOLDOWN_MS", value);
    const { getTemporalClient } = await import("./client");

    await expect(getTemporalClient()).rejects.toThrow(
      "TEMPORAL_CONNECT_FAILURE_COOLDOWN_MS must be between 100 and 30000",
    );
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("clears a connect failure when the client is closed", async () => {
    const failure = new Error("unavailable");
    mocks.connect.mockRejectedValueOnce(failure).mockResolvedValueOnce({ close: mocks.close });
    const { closeTemporalClient, getTemporalClient } = await import("./client");

    await expect(getTemporalClient()).rejects.toBe(failure);
    await closeTemporalClient();
    await expect(getTemporalClient()).resolves.toBeDefined();
    expect(mocks.connect).toHaveBeenCalledTimes(2);

    await closeTemporalClient();
  });

  it("starts run orchestration idempotently and accepts an already-started race", async () => {
    const { closeTemporalClient, startRankCheckRunWorkflow } = await import("./client");

    await expect(
      startRankCheckRunWorkflow({ runId: "run_1" }, { workflowId: "rank-check-run-rcr_1" }),
    ).resolves.toEqual({ alreadyExists: false, workflowId: "rank-check-run-rcr_1" });
    expect(mocks.start).toHaveBeenCalledWith("rankCheckRunWorkflow", {
      args: [{ runId: "run_1" }],
      taskQueue: "rank-checks",
      workflowId: "rank-check-run-rcr_1",
      workflowIdConflictPolicy: "FAIL",
      workflowIdReusePolicy: "REJECT_DUPLICATE",
    });

    mocks.start.mockRejectedValueOnce({ name: "WorkflowExecutionAlreadyStartedError" });
    await expect(
      startRankCheckRunWorkflow({ runId: "run_1" }, { workflowId: "rank-check-run-rcr_1" }),
    ).resolves.toEqual({ alreadyExists: true, workflowId: "rank-check-run-rcr_1" });
    await closeTemporalClient();
  });
});
