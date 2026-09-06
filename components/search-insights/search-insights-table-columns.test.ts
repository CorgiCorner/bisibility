import { describe, expect, it } from "vitest";
import { ORGANIC_SESSIONS_LABEL } from "./search-insights-copy";
import {
  MODULE_TABLE_COLUMN,
  MODULE_TABLE_COLUMN_CLASS,
  type ModuleTableVariant,
  moduleTableColumnClasses,
  moduleTableColumnOrder,
  moduleTableColumns,
  moduleTableHeaders,
  moduleTableMinWidth,
} from "./search-insights-table-columns";

const variants = Object.keys(moduleTableColumnOrder) as ModuleTableVariant[];

// Four pixels a step, the value Tailwind's spacing scale multiplies.
const SPACING_STEP = 4;

// The grid literals are written out in the module so the stylesheet builder can see them; this
// is the composition they have to match.
function gridTemplate(parts: readonly string[]) {
  return `grid-cols-[${parts.join("_")}]`;
}

// The narrowest a column may be: its fixed width, or the lower bound of its minmax().
function columnFloorPx(width: string) {
  return Number.parseFloat(width.replace("minmax(", ""));
}

describe("moduleTableColumns", () => {
  // The grid literals exist so the stylesheet builder can see them; this keeps them honest.
  it.each(variants)("builds the %s grid from the shared column widths", (variant) => {
    const parts = moduleTableColumnOrder[variant].map((name) => MODULE_TABLE_COLUMN[name]);
    expect(moduleTableColumns[variant]).toBe(gridTemplate(parts));
  });

  it.each([
    ["queries", ["Query", "Clicks", "Impr", "CTR", "Avg pos", "Actions"]],
    ["pages", ["Page", "Clicks", "Impr", "CTR", "Avg pos", "Actions"]],
    [
      "pagesWithKeyEvents",
      ["Page", "Clicks", ORGANIC_SESSIONS_LABEL, "Engagement", "Key events", "Actions"],
    ],
    [
      "pagesWithSessions",
      ["Page", "Clicks", ORGANIC_SESSIONS_LABEL, "Engagement", "Avg pos", "Actions"],
    ],
  ] as const)("derives the %s headers in the shared column order", (variant, labels) => {
    expect(moduleTableHeaders(variant).map((header) => header.label)).toEqual(labels);
    expect(moduleTableColumnClasses(variant)).toHaveLength(labels.length);
  });

  it("keeps the two first-view tables on the same geometry so they line up side by side", () => {
    expect(moduleTableColumns.pages).toBe(moduleTableColumns.queries);
  });

  // The GA4 variant is always six columns: text, clicks, the available funnel, then action.
  it("swaps impressions for sessions rather than adding a fifth numeric column", () => {
    expect(moduleTableColumnOrder.pagesWithSessions).toHaveLength(
      moduleTableColumnOrder.pages.length,
    );
  });

  it("keeps the key-events funnel shape on the same six-column geometry", () => {
    expect(moduleTableColumnOrder.pagesWithKeyEvents).toHaveLength(
      moduleTableColumnOrder.pages.length,
    );
  });

  it.each([true, false, null] as const)(
    "keeps both Top pages lenses aligned with Top queries when key events are %s",
    (keyEventsConfigured) => {
      const traffic: "pagesWithKeyEvents" | "pagesWithSessions" =
        keyEventsConfigured === true ? "pagesWithKeyEvents" : "pagesWithSessions";

      for (const variant of ["pages", traffic] as const) {
        expect(moduleTableColumnOrder[variant]).toHaveLength(moduleTableColumnOrder.queries.length);
      }
    },
  );

  it("does not give the GA4 funnel headers sort keys", () => {
    for (const variant of ["pagesWithKeyEvents", "pagesWithSessions"] as const) {
      for (const header of moduleTableHeaders(variant)) {
        if ([ORGANIC_SESSIONS_LABEL, "Engagement", "Key events"].includes(header.label)) {
          expect(header.sortKey).toBeUndefined();
        }
      }
    }
  });

  it("keeps every fixed width on the spacing scale, so no table needs an arbitrary value", () => {
    for (const [name, width] of Object.entries(MODULE_TABLE_COLUMN)) {
      if (!width.endsWith("px") || width.includes("(")) continue;
      const steps = Number.parseFloat(width) / SPACING_STEP;
      const utility = MODULE_TABLE_COLUMN_CLASS[name as keyof typeof MODULE_TABLE_COLUMN_CLASS];
      expect(utility).toBe(`w-${steps}`);
    }
  });

  it("gives CTR room for the sort gap so the icon cannot paint into Avg pos", () => {
    expect(MODULE_TABLE_COLUMN.ctr).toBe("60px");
    expect(MODULE_TABLE_COLUMN_CLASS.ctr).toBe("w-15");
  });

  it("gives Avg pos room for the sort gap so the label cannot paint into Actions", () => {
    expect(MODULE_TABLE_COLUMN.position).toBe("84px");
    expect(MODULE_TABLE_COLUMN_CLASS.position).toBe("w-21");
  });

  it("gives Engagement room for the nowrap eyebrow so it cannot paint into Key events", () => {
    expect(MODULE_TABLE_COLUMN.engagement).toBe("92px");
    expect(MODULE_TABLE_COLUMN_CLASS.engagement).toBe("w-23");
  });

  it("gives Key events room for the nowrap eyebrow so it cannot paint into Avg pos", () => {
    expect(MODULE_TABLE_COLUMN.keyEvents).toBe("84px");
    expect(MODULE_TABLE_COLUMN_CLASS.keyEvents).toBe("w-21");
  });

  it("leaves the text column unsized, so the fixed columns decide and it takes what is left", () => {
    expect(MODULE_TABLE_COLUMN_CLASS.text).toBe("w-auto");
    expect(MODULE_TABLE_COLUMN.text).toContain("minmax(138px");
  });

  // A fixed-layout table ignores a min-width on a column, so the floor only bites on the table.
  it.each(variants)("gives the %s table the minimum its columns add up to", (variant) => {
    const floor = moduleTableColumnOrder[variant].reduce(
      (total, name) => total + columnFloorPx(MODULE_TABLE_COLUMN[name]),
      0,
    );
    expect(moduleTableMinWidth[variant]).toBe(`min-w-${floor / SPACING_STEP}`);
  });
});
