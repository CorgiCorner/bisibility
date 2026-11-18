import { expect, test, vi } from "vitest";
import type { EngineInput } from "./run-engine";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), register: vi.fn(), unregister: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { assistantRun: { findUnique: vi.fn() } } }));
vi.mock("./run-engine", () => ({ executeAssistantRun: mocks.execute }));
vi.mock("./run-control", () => ({
  registerAssistantRun: mocks.register,
  unregisterAssistantRun: mocks.unregister,
}));

import { assistantRunStream } from "./run-stream";

test("closing the stream aborts its upstream signal", async () => {
  let signal: AbortSignal | undefined;
  let done: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    done = resolve;
  });
  mocks.execute.mockImplementation(async (input: EngineInput) => {
    signal = input.signal;
    if (!signal.aborted)
      await new Promise<void>((resolve) =>
        signal?.addEventListener("abort", () => resolve(), { once: true }),
      );
    done();
  });
  const input = { run: { id: "run" } } as Omit<EngineInput, "signal" | "timedOut" | "emit">;
  const response = assistantRunStream(input, new Request("http://localhost/"));
  await response.body?.getReader().cancel();
  await finished;
  expect(signal?.aborted).toBe(true);
});
