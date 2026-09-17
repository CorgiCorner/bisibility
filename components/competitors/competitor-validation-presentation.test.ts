import { describe, expect, it, vi } from "vitest";
import { presentCompetitorValidationMessage } from "./competitor-validation-presentation";

describe("presentCompetitorValidationMessage", () => {
  it("selects a localized known validation message and protects unknown details", () => {
    const pl = vi.fn((key: string) => `pl:${key}`);

    expect(presentCompetitorValidationMessage("Use a valid bare domain.", pl as never)).toBe(
      "pl:domainInvalid",
    );
    expect(
      presentCompetitorValidationMessage("validator trace: private.example", pl as never),
    ).toBe("pl:invalidField");
    expect(pl).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("private.example"),
    );
  });
});
