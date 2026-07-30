import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  connect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./connection-options", () => ({
  temporalConnectionOptions: () => ({ address: "temporal.test:7233" }),
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
});
