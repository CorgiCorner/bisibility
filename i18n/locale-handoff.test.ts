import { describe, expect, it } from "vitest";
import { localeHandoffHref, resolveLocaleHandoff } from "./locale-handoff";

describe("locale handoff", () => {
  it("preserves a configured selection and a safe local target", () => {
    expect(localeHandoffHref("pl", "/login?next=%2Fapp")).toBe(
      "/locale/handoff?locale=pl&next=%2Flogin%3Fnext%3D%252Fapp",
    );
    expect(resolveLocaleHandoff({ locale: "pl", next: "/login?next=%2Fapp" })).toEqual({
      locale: "pl",
      next: "/login?next=%2Fapp",
    });
  });

  it("rejects an invalid selection and refuses an off-origin target", () => {
    expect(resolveLocaleHandoff({ locale: "de", next: "/login" })).toBeNull();
    expect(resolveLocaleHandoff({ locale: "ja", next: "https://evil.example" })).toEqual({
      locale: "ja",
      next: "/login",
    });
  });
});
