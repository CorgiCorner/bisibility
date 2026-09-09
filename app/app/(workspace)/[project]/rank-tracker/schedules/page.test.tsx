import { permanentRedirect } from "@/tests/next-navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LegacySchedulesPage from "./page";

const resolve = vi.hoisted(() => vi.fn());
vi.mock("@/lib/queries/_auth", () => ({ resolveProjectAccess: resolve }));

describe("LegacySchedulesPage", () => {
  beforeEach(() => {
    resolve.mockResolvedValue({ publicId: "prj_canonical" });
    permanentRedirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
  });

  it("redirects the old schedule list to the resolved project's Runs section", async () => {
    await expect(
      LegacySchedulesPage({ params: Promise.resolve({ project: "project-alias" }) }),
    ).rejects.toThrow("NEXT_REDIRECT:/app/prj_canonical/runs/schedules");
    expect(resolve).toHaveBeenCalledWith("project-alias");
  });
});
