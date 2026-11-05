import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resetRecoveryStepLog, runRecoveryStep } from "./processor-steps";

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetRecoveryStepLog();
  log = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => log.mockRestore());

it("returns true and logs nothing when the step succeeds", async () => {
  expect(await runRecoveryStep("commands", async () => undefined, 0)).toBe(true);
  expect(log).not.toHaveBeenCalled();
});

it("names the step and a bounded error code, never the message", async () => {
  const error = Object.assign(new Error("secret postgresql://user:pass@host/db"), {
    code: "P2028",
  });
  expect(await runRecoveryStep("lookups", async () => Promise.reject(error), 0)).toBe(false);
  expect(log).toHaveBeenCalledTimes(1);
  const text = JSON.stringify(log.mock.calls[0]);
  expect(text).toContain("requires retry");
  expect(text).toContain("lookups");
  expect(text).toContain("P2028");
  expect(text).not.toContain("postgresql://");
});

it("deduplicates repeats per step and code, then reports the suppressed count", async () => {
  const fail = () => Promise.reject(Object.assign(new Error("x"), { code: "P2028" }));
  await runRecoveryStep("sweep", fail, 0);
  await runRecoveryStep("sweep", fail, 1000);
  await runRecoveryStep("sweep", fail, 2000);
  expect(log).toHaveBeenCalledTimes(1);
  await runRecoveryStep("sweep", fail, 11 * 60_000);
  expect(log).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(log.mock.calls[1])).toContain('"suppressed":2');
  await runRecoveryStep("other", fail, 11 * 60_000);
  expect(log).toHaveBeenCalledTimes(3);
});

it("falls back to the error name for an unsafe or missing code", async () => {
  await runRecoveryStep(
    "a",
    () => Promise.reject(Object.assign(new Error("x"), { code: "bad code!" })),
    0,
  );
  expect(JSON.stringify(log.mock.calls[0])).toContain('"code":"Error"');
  await runRecoveryStep("b", () => Promise.reject("plain string"), 0);
  expect(JSON.stringify(log.mock.calls[1])).toContain('"code":"unknown"');
});

it("adds the error class name next to a distinct code, and reads the clock after the step ran", async () => {
  class RecoveryFault extends Error {
    override name = "RecoveryFault";
  }
  await runRecoveryStep(
    "named",
    () => Promise.reject(Object.assign(new RecoveryFault("x"), { code: "P2028" })),
    0,
  );
  expect(JSON.stringify(log.mock.calls[0])).toContain('"name":"RecoveryFault"');
  log.mockClear();
  const failAfterDelay = async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    throw new Error("x");
  };
  // Without an injected clock the failure is stamped when it happens, not before the step began.
  await runRecoveryStep("late", failAfterDelay);
  await runRecoveryStep("late", failAfterDelay);
  expect(log).toHaveBeenCalledTimes(1);
});
