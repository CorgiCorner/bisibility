import { describe, expect, it } from "vitest";
import {
  parseRankTrackerAction,
  type RankTrackerAction,
  rankTrackerActionHref,
} from "./rank-tracker-command";

describe("rank-tracker-command", () => {
  describe("parseRankTrackerAction", () => {
    it("parses every known action value", () => {
      expect(parseRankTrackerAction("add")).toBe<RankTrackerAction>("add");
      expect(parseRankTrackerAction("import")).toBe<RankTrackerAction>("import");
      expect(parseRankTrackerAction("export")).toBe<RankTrackerAction>("export");
      expect(parseRankTrackerAction("filter")).toBe<RankTrackerAction>("filter");
    });

    it("rejects run-check as an unsafe paid action", () => {
      expect(parseRankTrackerAction("run-check")).toBeNull();
    });

    it("rejects unknown values", () => {
      expect(parseRankTrackerAction("unknown")).toBeNull();
      expect(parseRankTrackerAction("delete")).toBeNull();
      expect(parseRankTrackerAction("Add")).toBeNull();
      expect(parseRankTrackerAction("")).toBeNull();
    });

    it("rejects null and undefined", () => {
      expect(parseRankTrackerAction(null)).toBeNull();
      expect(parseRankTrackerAction(undefined)).toBeNull();
    });
  });

  describe("rankTrackerActionHref", () => {
    it("builds exact URLs for every action", () => {
      expect(rankTrackerActionHref("prj_1", "add")).toBe("/app/prj_1/rank-tracker?action=add");
      expect(rankTrackerActionHref("prj_1", "import")).toBe(
        "/app/prj_1/rank-tracker?action=import",
      );
      expect(rankTrackerActionHref("prj_1", "export")).toBe(
        "/app/prj_1/rank-tracker?action=export",
      );
      expect(rankTrackerActionHref("prj_1", "filter")).toBe(
        "/app/prj_1/rank-tracker?action=filter",
      );
    });

    it("uses a different project ref in the path", () => {
      expect(rankTrackerActionHref("prj_abc", "add")).toBe("/app/prj_abc/rank-tracker?action=add");
    });
  });
});
