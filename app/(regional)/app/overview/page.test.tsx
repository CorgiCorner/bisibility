import { redirect } from "@/tests/next-navigation";
import { describe, expect, it } from "vitest";

describe("legacy overview redirect", () => {
  it("sends a legacy deep link to the project entry point", async () => {
    const { default: LegacyOverview } = await import("./page");
    await LegacyOverview();
    expect(redirect).toHaveBeenCalledWith("/app");
  });
});
