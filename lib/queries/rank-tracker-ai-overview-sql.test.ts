import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { describe, expect, it } from "vitest";
import { aiOverviewPageItemsSql, aiOverviewShownIdsSql } from "./rank-tracker-ai-overview-sql";
import { buildRankTrackerListSql } from "./rank-tracker-list-sql";

function text(sql: { sql: string }) {
  return sql.sql.replace(/\s+/g, " ");
}

describe("AI Overview SQL", () => {
  it("filters shown overviews by item presence and does not read fragments", () => {
    const asOf = new Date("2026-11-09T07:11:00.000Z");
    const shown = text(
      aiOverviewShownIdsSql("project_internal", ["kw_abcdefghijklmnopqrstuvwx"], asOf),
    );
    expect(shown).toContain(`item."resultKind" = 'ai_overview'`);
    expect(shown).toContain(`rc2.status = 'completed'`);
    expect(shown).not.toContain("rawFragment");
    const page = text(
      aiOverviewPageItemsSql("project_internal", ["kw_abcdefghijklmnopqrstuvwx"], asOf),
    );
    expect(page).toContain(`item."rawFragment"`);
    expect(page).toContain(`k."publicId" IN`);
  });

  it("adds the presence predicate to the list query only when the filter is on", () => {
    const off = text(buildRankTrackerListSql("project_internal", defaultRankTrackerQueryState));
    expect(off).not.toContain(`item."resultKind" = 'ai_overview'`);
    const on = text(
      buildRankTrackerListSql("project_internal", {
        ...defaultRankTrackerQueryState,
        filters: { ...defaultRankTrackerQueryState.filters, aiOverviewShown: true },
        reportScope: {
          view: "general",
          subject: null,
          comparisonDays: 7,
          asOf: "2026-11-09T07:11:00.000Z",
        },
      }),
    );
    expect(on).toContain(`item."resultKind" = 'ai_overview'`);
    expect(on).not.toContain("rawFragment");
  });
});
