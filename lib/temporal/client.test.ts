import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  connect: vi.fn(),
  connectionOptions: vi.fn(),
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
      tlsSource: "auto-no-api-key",
    });
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

  it("clears a rejected connection so a later request can reconnect", async () => {
    mocks.connect
      .mockRejectedValueOnce(Object.assign(new Error("unavailable"), { code: "ECONNREFUSED" }))
      .mockResolvedValueOnce({ close: mocks.close });
    const { closeTemporalClient, getTemporalClient } = await import("./client");

    await expect(getTemporalClient()).rejects.toThrow("unavailable");
    await expect(getTemporalClient()).resolves.toBeDefined();
    expect(mocks.connect).toHaveBeenCalledTimes(2);

    await closeTemporalClient();
  });
});
