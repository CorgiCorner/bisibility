import { coreMessages } from "@/i18n/core-messages";
import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { filterRankTrackerLocalRows } from "@/lib/queries/rank-tracker-local-projection";
import { localListFixture } from "@/lib/queries/rank-tracker-local-test-fixture";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocalMeasurementCell, LocalTimeCell } from "./KeywordLocalColumns";

const messages = coreMessages;
function render(node: ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale="en"
      timeZone="UTC"
      now={new Date("2026-10-12T12:00:00.000Z")}
      messages={messages}
    >
      {node}
    </NextIntlClientProvider>,
  );
}
describe("actual Local table projection rendering", () => {
  it("without markets renders per-target business proof and unknown coverage without organic rank", () => {
    const f = localListFixture(6),
      projected = filterRankTrackerLocalRows(
        f.organic,
        f.report,
        structuredClone(defaultRankTrackerQueryState),
        f.policy,
      );
    const row = projected.rows.find((row) => row.id === "target-1"),
      fact = projected.facts.find((fact) => fact.keywordId === "target-1");
    if (!row) throw new Error("Missing target");
    const html = render(
      <>
        <LocalMeasurementCell row={row} fact={fact} />
        <LocalTimeCell row={row} fact={fact} />
      </>,
    );
    expect(html).toContain("Slot #2");
    expect(html).toContain("Latest attempt completed");
    expect(html).toContain("2026-10-12T11:00:00.000Z");
    expect(html).not.toContain("organic-only");
    const missing = projected.rows.find((row) => row.id === "target-0");
    if (!missing) throw new Error("Missing unknown target");
    expect(
      render(
        <LocalMeasurementCell
          row={missing}
          fact={projected.facts.find((fact) => fact.keywordId === missing.id)}
        />,
      ),
    ).toContain("Unknown");
  });
  it("with markets renders a real grouped row as explicit targets, never a fabricated best business rank", () => {
    const f = localListFixture(6),
      projected = filterRankTrackerLocalRows(
        f.organic,
        f.report,
        { ...structuredClone(defaultRankTrackerQueryState), grouped: true },
        f.policy,
      ),
      parent = projected.groups[0];
    expect(parent.subRows).toHaveLength(6);
    const html = render(
      <>
        <LocalMeasurementCell row={parent} />
        <LocalTimeCell row={parent} />
      </>,
    );
    expect(html).toContain("Expand 6 targets");
    expect(html).toContain("Expand for target times");
    expect(html).not.toContain("Slot #");
  });
});
