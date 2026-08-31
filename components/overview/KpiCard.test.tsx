import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiCard } from "./KpiCard";

describe("KpiCard", () => {
  it("links a failed first-check state to check runs", () => {
    render(
      <KpiCard
        delta="first check failed"
        deltaAction="check_runs"
        deltaTone="negative"
        label="Visibility"
        projectRef="prj_example"
        value="–"
      />,
    );

    expect(screen.getByRole("link", { name: "first check failed" })).toHaveAttribute(
      "href",
      "/app/prj_example/rank-tracker?tab=checks",
    );
  });
});
