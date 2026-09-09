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
  it("renders nothing without a connected Search Console property", () => {
    const { container } = render(
      <KeywordTopQueryImport
        costContext={costContext}
        currentKeywords=""
        hasAnalyticsSource={false}
        onAppendQueries={noop}
        projectId="prj_1"
      />,
    );

    expect(container).toBeEmptyDOMElement();
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
