import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketLabel } from "./MarketLabel";

describe("MarketLabel", () => {
  it("prefers a custom market name", () => {
    render(<MarketLabel device="Mobile" location="Warsaw" marketName="Poland mobile" />);

    expect(screen.getByText("Poland mobile")).toBeVisible();
    expect(screen.queryByText("Warsaw / Mobile")).not.toBeInTheDocument();
  });

  it("falls back to the location and device pair", () => {
    render(<MarketLabel device="Desktop" location="United States" marketName="  " />);

    expect(screen.getByText("United States / Desktop")).toBeVisible();
  });
});
