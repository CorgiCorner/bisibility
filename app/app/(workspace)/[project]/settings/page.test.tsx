import SettingsRedirect from "@/app/app/(workspace)/[project]/settings/page";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

describe("SettingsRedirect", () => {
  it("redirects the legacy settings root to the General section", async () => {
    await SettingsRedirect({
      params: Promise.resolve({ project: "prj_abcdefghijklmnopqrstuvwx" }),
    });

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/app/prj_abcdefghijklmnopqrstuvwx/settings/general",
    );
  });
});
