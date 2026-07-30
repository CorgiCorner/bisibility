import { afterEach, describe, expect, it } from "vitest";
import { isSupportedTimezone, timezoneSelectOptions } from "./timezones";

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
