import { composeStories } from "@storybook/react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as stories from "./UsageSettingsContent.stories";

const {
  CappedFallback,
  LegacyProject,
  MixedCentsUnits,
  NoBudgets,
  NoProviders,
  NoUsage,
  TopUpRequired,
} = composeStories(stories);

describe("UsageSettingsContent provider spend stories", () => {
  it("renders the legacy project allocation", () => {
    render(<LegacyProject />);
    expect(screen.getByText("$12.40 of $50.00 used")).toBeInTheDocument();
  });

  it("renders cents and native units together", () => {
    render(<MixedCentsUnits />);
    expect(screen.getByText("$0.10 + 28 searches")).toBeInTheDocument();
    expect(screen.getByText("28 of 100 searches used")).toBeInTheDocument();
    expect(screen.getByText(/222 left at provider \(6m ago\)/)).toBeInTheDocument();
    expect(screen.getByText(/Balance \$12.40 \(6m ago\) · does not expire/)).toBeInTheDocument();
  });

  it("renders the fallback banner for a capped primary", () => {
    render(<CappedFallback />);
    expect(
      screen.getByText("SerpApi hit its budget - checks are falling back to DataForSEO."),
    ).toBeInTheDocument();
    expect(screen.getByText("100 of 100 searches used")).toBeInTheDocument();
    expect(screen.getByText(/Balance \$12.40 \(6m ago\) · does not expire/)).toBeInTheDocument();
  });

  it("renders the provider top-up state", () => {
    render(<TopUpRequired />);
    expect(
      screen.getByText("DataForSEO needs a top up before checks can continue."),
    ).toBeInTheDocument();
    expect(screen.getByText("top up required")).toBeInTheDocument();
    const list = screen.getByText("top up required").closest("ul");
    expect(list).toHaveClass("border-t");
    expect(list).not.toHaveClass("border-y", "border-b");
  });

  it.each(["prj_story", "prj_another"])(
    "links provider attention to connection settings for %s",
    (projectRef) => {
      render(<TopUpRequired projectRef={projectRef} />);
      expect(screen.getByRole("link", { name: "Connection settings" })).toHaveAttribute(
        "href",
        `/app/${projectRef}/integrations`,
      );
    },
  );

  it("renders recorded usage with no budgets", () => {
    render(<NoBudgets />);
    expect(screen.getByText("No budget set")).toBeInTheDocument();
    expect(screen.getByText("$0.10 + 28 searches")).toBeInTheDocument();
  });

  it("renders the allocated no-usage state", () => {
    render(<NoUsage />);
    expect(screen.getAllByText("No usage yet").length).toBeGreaterThan(0);
    expect(screen.getByText("0 of 100 searches used")).toBeInTheDocument();
  });

  it("renders the no-provider state", () => {
    render(<NoProviders />);
    expect(screen.getByText("Usage appears once a provider is connected.")).toBeInTheDocument();
  });
});
