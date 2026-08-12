import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("@phosphor-icons/react");
  vi.resetModules();
});

describe("keyword detail loading route", () => {
  it("loads without evaluating client icon context in the RSC boundary", async () => {
    vi.doMock("@phosphor-icons/react", () => {
      throw new TypeError("react.createContext is not available in Server Components");
    });

    await expect(import("./loading")).resolves.toMatchObject({ default: expect.any(Function) });
  });
});
