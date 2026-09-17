import { describe, expect, it } from "vitest";
import {
  canonicalLocaleUrlSegment,
  htmlLanguage,
  localeUrlSegment,
  parseLocaleUrlSegment,
  resolveViewerLocale,
} from "./config";
import { localeFieldsForNewUser } from "./locale-preference.server";

describe("viewer locale resolution", () => {
  it("keeps the configured language tag for the document language", () => {
    expect(htmlLanguage("es-ES")).toBe("es-ES");
    expect(htmlLanguage("ja")).toBe("ja");
  });

  it("does not share a locale between independent requests", () => {
    const polish = resolveViewerLocale({ acceptLanguage: "pl-PL,pl;q=0.9" });
    const english = resolveViewerLocale({ acceptLanguage: "en-US,en;q=0.9" });

    expect(polish).toMatchObject({ configuredLocale: "pl", locale: "pl", source: "header" });
    expect(english).toMatchObject({ configuredLocale: "en", locale: "en", source: "header" });
  });

  it("auto-detects each activated language from the header", () => {
    expect(resolveViewerLocale({ acceptLanguage: "es-419,es;q=0.9" })).toMatchObject({
      locale: "es-ES",
      source: "header",
    });
    expect(resolveViewerLocale({ acceptLanguage: "ja-JP,ja;q=0.9" })).toMatchObject({
      locale: "ja",
      source: "header",
    });
    expect(resolveViewerLocale({ acceptLanguage: "de-DE,de;q=0.9" })).toMatchObject({
      configuredLocale: null,
      locale: "en",
      source: "default",
    });
  });

  it("keeps an explicit persisted locale ahead of a later cookie", () => {
    expect(
      resolveViewerLocale({
        cookieLocale: "en",
        persistedLocale: "pl",
        persistedLocaleSelectedAt: new Date("2026-09-12T09:00:00.000Z"),
      }),
    ).toMatchObject({ configuredLocale: "pl", locale: "pl", source: "persisted" });
  });

  it("uses a valid cookie before a header when no preference was persisted", () => {
    expect(
      resolveViewerLocale({
        acceptLanguage: "en-US,en;q=0.9",
        cookieLocale: "pl",
        persistedLocale: "en",
        persistedLocaleSelectedAt: null,
      }),
    ).toMatchObject({ configuredLocale: "pl", locale: "pl", source: "cookie" });
  });

  it("honors weighted header preferences and skips q=0 ranges", () => {
    expect(resolveViewerLocale({ acceptLanguage: "ja;q=0,pl;q=1,en;q=0.5" })).toMatchObject({
      configuredLocale: "pl",
      locale: "pl",
      source: "header",
    });
    expect(resolveViewerLocale({ acceptLanguage: "pl;q=0.4,en;q=0.9" })).toMatchObject({
      configuredLocale: "en",
      locale: "en",
      source: "header",
    });
  });

  it("ignores malformed locale input", () => {
    expect(resolveViewerLocale({ acceptLanguage: "de-DE", cookieLocale: "../../pl" })).toEqual({
      configuredLocale: null,
      locale: "en",
      source: "default",
    });
  });
});

describe("new user locale fields", () => {
  it("copies an explicit anonymous selection instead of writing the database default", () => {
    const selectedAt = new Date("2026-09-12T10:00:00.000Z");
    expect(localeFieldsForNewUser({ getCookie: () => "pl" }, selectedAt)).toEqual({
      uiLocale: "pl",
      uiLocaleSelectedAt: selectedAt,
    });
  });

  it("leaves Prisma's English default alone without an explicit cookie", () => {
    expect(localeFieldsForNewUser({ getCookie: () => null })).toEqual({});
  });
});

describe("locale URL segments", () => {
  it("shortens the Spanish segment to the language and leaves the others alone", () => {
    expect(localeUrlSegment("es-ES")).toBe("es");
    expect(localeUrlSegment("ja")).toBe("ja");
    expect(localeUrlSegment("pl")).toBe("pl");
    expect(localeUrlSegment("en")).toBe("en");
  });

  it("resolves only the canonical segment back to its internal locale code", () => {
    expect(parseLocaleUrlSegment("es")).toBe("es-ES");
    expect(parseLocaleUrlSegment("ja")).toBe("ja");
    expect(parseLocaleUrlSegment("es-ES")).toBeUndefined();
    expect(parseLocaleUrlSegment("ES")).toBeUndefined();
    expect(parseLocaleUrlSegment("de")).toBeUndefined();
    expect(parseLocaleUrlSegment(42)).toBeUndefined();
  });

  it("names the canonical segment behind every spelling of an active prefix", () => {
    expect(canonicalLocaleUrlSegment("es-ES")).toBe("es");
    expect(canonicalLocaleUrlSegment("es-es")).toBe("es");
    expect(canonicalLocaleUrlSegment("ES")).toBe("es");
    expect(canonicalLocaleUrlSegment("es")).toBe("es");
    expect(canonicalLocaleUrlSegment("JA")).toBe("ja");
    expect(canonicalLocaleUrlSegment("Pl")).toBe("pl");
    expect(canonicalLocaleUrlSegment("en")).toBeUndefined();
    expect(canonicalLocaleUrlSegment("de")).toBeUndefined();
    expect(canonicalLocaleUrlSegment("")).toBeUndefined();
  });
});
