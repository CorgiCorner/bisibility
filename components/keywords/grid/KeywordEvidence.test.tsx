import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { evidenceRecoveryFixture } from "@/lib/metering/recovery/evidence-view-fixture";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeywordChangeCell } from "./KeywordChangeCell";
import { KeywordRankValue } from "./KeywordRankValue";
import { rankQualityRow } from "./keyword-rank-quality.test-fixture";

describe("UI-6 keyword evidence", () => {
  it.each([7, null])(
    "shows partial %s with checked depth instead of full-depth absence",
    (position) => {
      const projection = evidenceRecoveryFixture("partial").rows[0].evidence?.projection;
      if (!projection) throw new Error("No fixture projection");
      render(
        <KeywordRankValue row={{ ...rankQualityRow(), rankEvidence: { projection, position } }} />,
      );
      expect(screen.getByText("Incomplete · to #20")).toBeVisible();
      expect(screen.queryByText(/not in top 100/i)).toBeNull();
    },
  );
  it("shows recovered original time and removes movement and event affordances", () => {
    const projection = evidenceRecoveryFixture("recovered", "unknown").rows[0].evidence?.projection;
    if (!projection) throw new Error("No fixture projection");
    const row = { ...rankQualityRow(), rankEvidence: { projection, position: 7 } };
    render(
      <>
        <KeywordRankValue row={row} />
        <KeywordChangeCell row={row} />
      </>,
    );
    expect(screen.getByText(/Original check:/)).toBeVisible();
    expect(screen.getByText("Cost remains unknown")).toBeVisible();
    expect(screen.queryByLabelText(/up|down|entered|exited/i)).toBeNull();
  });
  it("preserves the legacy qualified row", () => {
    render(<KeywordRankValue row={rankQualityRow()} />);
    expect(screen.getByText("#6")).toBeVisible();
  });
});
