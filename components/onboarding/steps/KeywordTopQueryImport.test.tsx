import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeywordTopQueryImport } from "./KeywordTopQueryImport";

function noop() {}

const costContext = {
  cronExpression: null,
  depth: 100 as const,
  deviceCount: 1,
  frequency: "daily" as const,
  locationCount: 1,
  overrideCents: null,
  providerId: "dataforseo",
};

describe("KeywordTopQueryImport", () => {
  it("prompts to connect Search Console on this step when no analytics source", () => {
    render(
      <KeywordTopQueryImport
        costContext={costContext}
        currentKeywords=""
        hasAnalyticsSource={false}
        onAppendQueries={noop}
        projectId="prj_1"
      />,
    );

    expect(
      screen.getByText("Connect Search Console above to import your real queries."),
    ).toBeInTheDocument();
  });

  it("says to select a property when Google is connected but none is chosen yet", () => {
    render(
      <KeywordTopQueryImport
        awaitingPropertySelection
        costContext={costContext}
        currentKeywords=""
        hasAnalyticsSource={false}
        onAppendQueries={noop}
        projectId="prj_1"
      />,
    );

    expect(
      screen.getByText("Select a Search Console property above, then import your queries."),
    ).toBeInTheDocument();
  });

  it("shows the import action once an analytics source is connected", () => {
    render(
      <KeywordTopQueryImport
        costContext={costContext}
        currentKeywords=""
        hasAnalyticsSource
        onAppendQueries={noop}
        projectId="prj_1"
      />,
    );

    expect(
      screen.getByRole("button", { name: /Import top queries from Search Console/ }),
    ).toBeInTheDocument();
  });
});
