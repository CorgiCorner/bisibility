import { permanentRedirect } from "@/tests/next-navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LegacySchedulePage from "./page";

const resolve = vi.hoisted(() => vi.fn());
vi.mock("@/lib/queries/_auth", () => ({ resolveProjectAccess: resolve }));

describe("LegacySchedulePage", () => {
  beforeEach(() => {
    resolve.mockResolvedValue({ publicId: "prj_canonical" });
    permanentRedirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
  });

  it.each(["new", "sch_abcdefghijklmnopqrstuvwx"])(
    "preserves the %s destination while moving out of Rank Tracker",
    async (publicId) => {
      await expect(
        LegacySchedulePage({ params: Promise.resolve({ project: "project-alias", publicId }) }),
      ).rejects.toThrow(`NEXT_REDIRECT:/app/prj_canonical/runs/schedules/${publicId}`);
      expect(resolve).toHaveBeenCalledWith("project-alias");
    },
  );
});
