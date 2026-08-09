import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

describe("legacy overview redirect", () => {
  it("sends a legacy deep link to the project entry point", async () => {
    const { default: LegacyOverview } = await import("./page");
    await LegacyOverview();
    expect(mocks.redirect).toHaveBeenCalledWith("/app");
  });
});
