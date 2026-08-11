import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MatchScopeCard } from "@/components/settings/tracking/MatchScopeCard";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("MatchScopeCard", () => {
  it("documents the real all-subdomains matching rule without a setting", () => {
    const { container } = render(<MatchScopeCard domain="example.com" />);

    const currentRow = screen.getByText("All subdomains").closest("div.flex");
    const primaryRow = screen.getByText("Primary domain + www").closest("div.flex");
    expect(currentRow).not.toBeNull();
    expect(primaryRow).not.toBeNull();
    expect(within(currentRow as HTMLElement).getByText("Current")).toBeInTheDocument();
    expect(within(primaryRow as HTMLElement).queryByText("Current")).not.toBeInTheDocument();
    expect(screen.getByText(/docs\.example\.com/)).toBeInTheDocument();
    expect(
      screen.getByText(/HTTP\/HTTPS and URL paths do not change the match/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Matching is fixed per project today - changing it is on the roadmap."),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(0);
  });

  it("shows a quiet setup state when the project has no domain", () => {
    render(<MatchScopeCard domain={null} />);

    expect(screen.getByText("Set a domain first")).toBeInTheDocument();
    expect(screen.queryByText("Current")).not.toBeInTheDocument();
  });

  it("cites the rank-check result matcher that establishes the current scope", () => {
    const source = readFileSync(resolve(import.meta.dirname, "MatchScopeCard.tsx"), "utf8");

    expect(source).toContain("lib/providers/serp/organic-result-decision.ts:74-83");
    expect(source).toContain("lib/domains/normalize.ts:12-20");
  });
});
