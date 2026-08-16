import { TeamRolesAccessCard } from "@/components/settings/team/TeamRolesAccessCard";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("TeamRolesAccessCard", () => {
  it("renders exactly one separator between the last capability row and the footnote", () => {
    render(<TeamRolesAccessCard />);

    const lastCapabilityLabel = "Transfer ownership, delete project";
    const lastRow = screen.getByText(lastCapabilityLabel).closest("[class*='grid']");
    expect(lastRow).not.toBeNull();
    expect(lastRow).not.toHaveClass("border-b");

    const penultimateRow = screen.getByText("Billing").closest("[class*='grid']");
    expect(penultimateRow).not.toBeNull();
    expect(penultimateRow).toHaveClass("border-b");

    const footnote = screen.getByText(/Owner is unique/);
    expect(footnote).toHaveClass("border-t");
    expect(footnote).not.toHaveClass("border-b");
  });
});
