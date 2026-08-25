import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IntegrationsByoNote } from "./IntegrationsByoNote";

describe("IntegrationsByoNote", () => {
  it("paints the key glyph with the primary solid token", () => {
    const { container } = render(<IntegrationsByoNote />);

    const icon = container.querySelector("svg");
    expect(icon).toHaveClass("text-accent-solid");
    expect(icon).not.toHaveClass("text-accent-text");
  });
});
