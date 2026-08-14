import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isSupportedProjectTimezone,
  isSupportedTimezone,
  normalizeProjectTimezone,
  timezoneSelectOptions,
} from "./timezones";

const winterReference = new Date("2026-01-15T12:00:00.000Z");
const supportedValuesOf = Intl.supportedValuesOf;

afterEach(() => {
  Object.defineProperty(Intl, "supportedValuesOf", {
    configurable: true,
    value: supportedValuesOf,
    writable: true,
  });
});

describe("timezoneSelectOptions", () => {
  it("pins UTC first and includes the full IANA catalogue", () => {
    const options = timezoneSelectOptions("Europe/Warsaw", winterReference);

    expect(options[0]?.value).toBe("UTC");
    expect(options.length).toBeGreaterThan(400);
    expect(options.some((option) => option.value === "Europe/Warsaw")).toBe(true);
  });

  it("includes the current GMT offset in zone labels", () => {
    const warsaw = timezoneSelectOptions("Europe/Warsaw", winterReference).find(
      (option) => option.value === "Europe/Warsaw",
    );

    expect(warsaw?.label).toMatch(/GMT[+-]\d{2}:\d{2}/);
  });

  it("prepends an unknown current value so it remains selectable", () => {
    const options = timezoneSelectOptions("Custom/Existing", winterReference);

    expect(options[0]).toEqual({ label: "Custom/Existing", value: "Custom/Existing" });
    expect(options.some((option) => option.value === "UTC")).toBe(true);
  });

  it("computes deterministic DST-aware offsets from the reference date", () => {
    const options = timezoneSelectOptions("Europe/Warsaw", winterReference);

    expect(options.find((option) => option.value === "Europe/Warsaw")?.label).toBe(
      "Europe/Warsaw (GMT+01:00)",
    );
    expect(options.find((option) => option.value === "America/New_York")?.label).toBe(
      "America/New_York (GMT-05:00)",
    );
  });

  it("reuses the catalogue within the same minute", () => {
    const first = timezoneSelectOptions("UTC", winterReference);
    const second = timezoneSelectOptions("UTC", new Date("2026-01-15T12:00:59.999Z"));

    expect(second).toBe(first);
  });

  it("uses the previous timezone choices when supportedValuesOf is unavailable", () => {
    Object.defineProperty(Intl, "supportedValuesOf", {
      configurable: true,
      value: undefined,
      writable: true,
    });

    expect(
      timezoneSelectOptions("Europe/Warsaw", winterReference).map(({ value }) => value),
    ).toEqual(["UTC", "America/New_York", "Europe/Warsaw"]);
  });
});

describe("isSupportedTimezone", () => {
  it("accepts IANA time zones and rejects free-form values", () => {
    expect(isSupportedTimezone("UTC")).toBe(true);
    expect(isSupportedTimezone("Europe/Warsaw")).toBe(true);
    expect(isSupportedTimezone("warsaw")).toBe(false);
  });
});

describe("isSupportedProjectTimezone", () => {
  it("accepts IANA identifiers in the module-cached allowlist", () => {
    expect(isSupportedProjectTimezone("UTC")).toBe(true);
    expect(isSupportedProjectTimezone("Europe/Warsaw")).toBe(true);
    expect(isSupportedProjectTimezone("America/New_York")).toBe(true);
  });

  it("rejects free-form or unsupported values by set membership", () => {
    expect(isSupportedProjectTimezone("warsaw")).toBe(false);
    expect(isSupportedProjectTimezone("Mars/Olympus")).toBe(false);
    expect(isSupportedProjectTimezone("")).toBe(false);
    expect(isSupportedProjectTimezone("GMT")).toBe(false);
  });

  it("uses the fallback set when supportedValuesOf is unavailable", async () => {
    Object.defineProperty(Intl, "supportedValuesOf", {
      configurable: true,
      value: undefined,
      writable: true,
    });
    vi.resetModules();
    const { isSupportedProjectTimezone } = await import("./timezones");

    expect(isSupportedProjectTimezone("UTC")).toBe(true);
    expect(isSupportedProjectTimezone("Europe/Warsaw")).toBe(true);
    expect(isSupportedProjectTimezone("America/New_York")).toBe(true);
    expect(isSupportedProjectTimezone("Europe/Madrid")).toBe(false);
  });
});

describe("normalizeProjectTimezone", () => {
  it("returns valid IANA identifiers unchanged", () => {
    expect(normalizeProjectTimezone("UTC")).toBe("UTC");
    expect(normalizeProjectTimezone("Europe/Madrid")).toBe("Europe/Madrid");
    expect(normalizeProjectTimezone("America/New_York")).toBe("America/New_York");
  });

  it("trims surrounding whitespace from valid input", () => {
    expect(normalizeProjectTimezone("  Europe/Madrid  ")).toBe("Europe/Madrid");
  });

  it("falls back to UTC for missing, non-string, or junk input", () => {
    expect(normalizeProjectTimezone(undefined)).toBe("UTC");
    expect(normalizeProjectTimezone(null)).toBe("UTC");
    expect(normalizeProjectTimezone(42)).toBe("UTC");
    expect(normalizeProjectTimezone({ zone: "Europe/Madrid" })).toBe("UTC");
    expect(normalizeProjectTimezone("")).toBe("UTC");
    expect(normalizeProjectTimezone("   ")).toBe("UTC");
    expect(normalizeProjectTimezone("warsaw")).toBe("UTC");
    expect(normalizeProjectTimezone("Europe/Madrid/Extra")).toBe("UTC");
  });

  it("uses the fallback set when supportedValuesOf is unavailable", async () => {
    Object.defineProperty(Intl, "supportedValuesOf", {
      configurable: true,
      value: undefined,
      writable: true,
    });
    vi.resetModules();
    const { normalizeProjectTimezone } = await import("./timezones");

    expect(normalizeProjectTimezone("UTC")).toBe("UTC");
    expect(normalizeProjectTimezone("Europe/Warsaw")).toBe("Europe/Warsaw");
    expect(normalizeProjectTimezone("America/New_York")).toBe("America/New_York");
    expect(normalizeProjectTimezone("Europe/Madrid")).toBe("UTC");
  });
});
