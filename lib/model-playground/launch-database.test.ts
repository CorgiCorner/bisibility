import { expect, test, vi } from "vitest";
import { withFixtureRestore } from "./launch-database.test-support";

test.each([new Error("body failed"), undefined, null, false, 0, ""])(
  "fixture cleanup preserves the original thrown value: %j",
  async (failure) => {
    const cleanup = vi.fn(async () => {
      throw new Error("cleanup failed");
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(
        withFixtureRestore(async () => {
          throw failure;
        }, cleanup),
      ).rejects.toBe(failure);
      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(logged).toHaveBeenCalledWith("Fixture cleanup failed", expect.any(Error));
    } finally {
      logged.mockRestore();
    }
  },
);

test.each([undefined, false, new Error("cleanup failed")])(
  "a successful body surfaces a cleanup failure: %j",
  async (failure) => {
    await expect(
      withFixtureRestore(
        async () => "ok",
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);
  },
);

test("successful cleanup preserves the body result", async () => {
  const cleanup = vi.fn(async () => undefined);
  expect(await withFixtureRestore(async () => "ok", cleanup)).toBe("ok");
  expect(cleanup).toHaveBeenCalledTimes(1);
});
