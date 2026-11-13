import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FieldLabel, FormField } from "./FieldLabel";

describe("FieldLabel", () => {
  it("keeps label, control and caption rows aligned with or without help", () => {
    const { container } = render(
      <>
        <FormField label="Language" caption="Language help">
          <input />
        </FormField>
        <FormField help="Search info" label="Search" caption="Search help">
          <input />
        </FormField>
      </>,
    );
    const fields = container.querySelectorAll("[data-form-field]");
    for (const field of fields) {
      expect(field).toHaveClass("grid", "gap-2");
      expect(field.firstElementChild).toHaveClass("h-5");
      expect(field.lastElementChild).toHaveClass("text-ui-caption");
    }
    expect(screen.getByRole("button", { name: "Search info" })).toHaveClass("size-4");
  });

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
