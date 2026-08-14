import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SavedKeywordsEmptyState } from "./SavedKeywordsEmptyState";

describe("SavedKeywordsEmptyState", () => {
  it("renders the 36C faux header and exact empty-state copy", () => {
    render(<SavedKeywordsEmptyState projectRef="prj_1" />);

    for (const heading of ["Keyword", "Volume", "KD", "CPC", "Intent"]) {
      expect(screen.getByText(heading)).toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { name: "Nothing saved yet" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Save ideas from Research to build a shortlist before you commit to tracking. Saving is free and runs no checks.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find keywords in Research" })).toHaveAttribute(
      "href",
      "/app/prj_1/keyword-research",
    );
    expect(
      screen.getByText(
        "Tracked keywords cost provider budget every month. Save first, track when you are ready.",
      ),
    ).toBeInTheDocument();
  });
});
