import SettingsRedirect from "@/app/app/(workspace)/[project]/settings/page";
import { redirect } from "@/tests/next-navigation";
import { describe, expect, it } from "vitest";

describe("SettingsRedirect", () => {
  it("redirects the legacy settings root to the General section", async () => {
    await SettingsRedirect({
      params: Promise.resolve({ project: "prj_abcdefghijklmnopqrstuvwx" }),
    });

    expect(redirect).toHaveBeenCalledWith("/app/prj_abcdefghijklmnopqrstuvwx/settings/general");
  });
});
