import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..", "..");

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

/**
 * The Add keywords drawer must consume the shared market blocks rather than grow a second set of
 * market controls beside them. These are import-graph facts, so they are read from source.
 */
describe("Add keywords drawer market surfaces", () => {
  it("renders the shared blocks instead of a sibling market control", () => {
    const controls = source("components/keywords/add/AddKeywordTrackingControls.tsx");
    expect(controls).toContain('from "@/components/markets/blocks/MarketChips"');
    expect(controls).toContain('from "@/components/markets/blocks/ScheduleAssignment"');
    expect(source("components/markets/sheet/NewMarketCreator.tsx")).toContain(
      'from "@/components/markets/blocks/MarketDefinition"',
    );
    expect(source("components/keywords/add/AddKeywordDrawerPanels.tsx")).not.toContain(
      "ProjectMarketsSelector",
    );
  });

  it("creates markets through the project action rather than a drawer-local path", () => {
    const step = source("components/keywords/add/useAddKeywordDrawerMarkets.ts");
    expect(step).toContain('from "@/lib/actions/project-market-create"');
    expect(step).not.toContain("prisma");
  });

  it("uses one complete market creator in both drawer hosts", () => {
    expect(source("components/keywords/add/AddKeywordDrawerFrame.tsx")).toContain(
      'from "@/components/markets/sheet/NewMarketCreator"',
    );
    expect(source("components/markets/sheet/NewMarketSheet.tsx")).toContain(
      'from "./NewMarketCreator"',
    );
  });

  it("reuses tracking controls and in-drawer market creation for keyword markets", () => {
    expect(source("components/keywords/KeywordMarketsDrawer.tsx")).toContain(
      "AddKeywordTrackingControls",
    );
    expect(source("components/keywords/KeywordMarketsDrawer.tsx")).toContain("NewMarketCreator");
  });
});
