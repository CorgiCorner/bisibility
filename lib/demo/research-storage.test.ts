import { describe, expect, it } from "vitest";
import {
  demoResearchFreshUntil,
  demoResearchStorageState,
  isEditableDemoResearchProject,
} from "./research-storage";

const projectPublicId = "prj_abcdefghijklmnopqrstuvwx";

describe("demo research storage", () => {
  it("fails closed outside the exact editable demo project", () => {
    const editable = {
      DEMO_MODE: "editable",
      DEMO_OWNER_ID: "usr_zyxwvutsrqponmlkjihgfedc",
      DEMO_PROJECT_ID: projectPublicId,
      DEMO_USER_ID: "usr_abcdefghijklmnopqrstuvwx",
    };
    expect(isEditableDemoResearchProject(projectPublicId, editable)).toBe(true);
    expect(isEditableDemoResearchProject("prj_bcdefghijklmnopqrstuvwxy", editable)).toBe(false);
    expect(isEditableDemoResearchProject(projectPublicId, {})).toBe(false);
  });

  it("uses the oldest successful source timestamp for a 30-day read freshness", () => {
    const freshUntil = demoResearchFreshUntil([
      "2026-08-11T12:00:00.000Z",
      "2026-08-10T12:00:00.000Z",
    ]);
    expect(freshUntil?.toISOString()).toBe("2026-09-09T12:00:00.000Z");
    expect(
      demoResearchStorageState({
        freshUntil: freshUntil ?? new Date(0),
        now: new Date("2026-09-10T12:00:00.000Z"),
        savedAt: "2026-08-11T12:00:00.000Z",
      }),
    ).toMatchObject({ stale: true });
  });
});
