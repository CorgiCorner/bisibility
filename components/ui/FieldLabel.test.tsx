import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FieldLabel } from "./FieldLabel";

describe("FieldLabel", () => {
  it("associates the label with its field and renders optional help", () => {
    render(
      <>
        <FieldLabel help="Comma-separated labels." htmlFor="tags" label="Tags" />
        <input id="tags" />
      </>,
    );

    expect(screen.getByLabelText("Tags")).toHaveAttribute("id", "tags");
    expect(screen.getByRole("button", { name: "Comma-separated labels." })).toBeInTheDocument();
  });
});
