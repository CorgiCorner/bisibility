import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReadonlyField } from "./StepScheduleFields";

describe("StepScheduleFields", () => {
  it("does not apply the interactive focus accent to readonly boxes", () => {
    render(<ReadonlyField label="Provider" name="provider" value="SerpApi" />);

    expect(screen.getByLabelText("Provider").parentElement).not.toHaveClass(
      "focus-within:border-accent",
    );
  });
});
