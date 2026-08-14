import MarketsSettingsPage from "@/app/app/(workspace)/[project]/settings/(sections)/markets/page";
import { redirect } from "@/tests/next-navigation";
import { describe, expect, it } from "vitest";

describe("MarketsSettingsPage", () => {
  it("redirects the retired Markets page to Tracking", async () => {
    await MarketsSettingsPage({ params: Promise.resolve({ project: "prj_1" }) });

    expect(redirect).toHaveBeenCalledWith("/app/prj_1/settings/tracking");
  });
});
