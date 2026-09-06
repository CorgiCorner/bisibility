import { emptyRankCopy } from "@/components/keywords/KeywordPendingEmptyState";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeywordPendingModules } from "./KeywordPendingModules";

describe("KeywordPendingModules", () => {
  it("renders only the pending history state below the shared header", () => {
    render(
      <KeywordPendingModules
        copy={emptyRankCopy("never_checked", "prj_test", 20, true)}
        state="never_checked"
      />,
    );

    expect(screen.getByRole("heading", { name: "Position history" })).toBeInTheDocument();
    expect(screen.queryByText("What changed")).not.toBeInTheDocument();
    expect(screen.queryByText("Ranking URL")).not.toBeInTheDocument();
  });
});
