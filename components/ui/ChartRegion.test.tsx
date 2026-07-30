import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartRegion } from "./ChartRegion";

describe("ChartRegion", () => {
  it("gives chart content one shared accessible region label", () => {
    render(
      <ChartRegion label="Position trend chart. Avg position held steady over the last 30 days">
        <svg aria-hidden />
      </ChartRegion>,
    );

    expect(
      screen.getByRole("region", {
        name: "Position trend chart. Avg position held steady over the last 30 days",
      }),
    ).toBeInTheDocument();
  });
});
