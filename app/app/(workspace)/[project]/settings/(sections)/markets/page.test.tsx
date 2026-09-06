import MarketsSettingsPage from "@/app/app/(workspace)/[project]/settings/(sections)/markets/page";
import { redirect } from "@/tests/next-navigation";
import { describe, expect, it } from "vitest";

describe("MarketsSettingsPage", () => {
  it("redirects the retired Markets settings page to the markets route", async () => {
    // `markets` is a project-level route now, so the retired settings address points at the
    // canonical one instead of jumping straight into tracking settings.
    await MarketsSettingsPage({ params: Promise.resolve({ project: "prj_1" }) });

    expect(redirect).toHaveBeenCalledWith("/app/prj_1/markets");
  });
});
