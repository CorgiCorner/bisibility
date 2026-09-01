import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiCard } from "./KpiCard";

describe("KpiCard", () => {
  it("shows Visibility coverage and its formal Top-20 definition", () => {
    const description = "Visibility measures volume-weighted ranking strength in Google's Top 20.";
    render(
      <KpiCard
        delta="new"
        deltaTone="neutral"
        description={description}
        detail="7 of 10 keywords measured"
        label="Visibility"
        value="42%"
      />,
    );

    expect(screen.getByText("7 of 10 keywords measured")).toBeVisible();
    expect(screen.getByRole("button", { name: description })).toBeVisible();
  });

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
