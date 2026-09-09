import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock("@temporalio/client", () => {
  state.load();
  return { Client: vi.fn(), Connection: { connect: vi.fn() } };
});

afterEach(() => vi.unstubAllEnvs());

it("keeps import, disabled scheduling, and close independent of the Temporal SDK", async () => {
  vi.stubEnv("SCHEDULER_DRIVER", "worker");
  const client = await import("./client");

  expect(state.load).not.toHaveBeenCalled();
  await expect(client.getTemporalClient()).rejects.toMatchObject({
    code: "engine_owned_by_worker",
  });
  vi.stubEnv("SCHEDULER_DRIVER", "none");
  await expect(client.getTemporalClient()).rejects.toMatchObject({ code: "scheduler_disabled" });
  await client.closeTemporalClient();
  expect(state.load).not.toHaveBeenCalled();
});
