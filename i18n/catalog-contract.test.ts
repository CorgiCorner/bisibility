import { describe, expect, it } from "vitest";
import {
  assertMessageCatalog,
  mergeMessageCatalogs,
  messageSignature,
  validateCatalogParity,
} from "./catalog-contract";

const english = {
  feature: {
    notice: "Read the <docs>guide</docs>. {count, plural, =0 {No rows} one {# row} other {# rows}}",
  },
};

describe("catalog contract", () => {
  it("merges independently owned sibling fragments without dropping either subtree", () => {
    expect(
      mergeMessageCatalogs(
        { account: { preferences: { title: "Preferences" } } },
        { account: { preferences: { saved: "Saved" } } },
      ),
    ).toEqual({
      account: { preferences: { saved: "Saved", title: "Preferences" } },
    });
  });

  it("rejects duplicate message leaves instead of silently overwriting them", () => {
    expect(() =>
      mergeMessageCatalogs(
        { account: { preferences: { title: "Preferences" } } },
        { account: { preferences: { title: "Settings" } } },
      ),
    ).toThrow("Duplicate message leaf at account.preferences.title.");
  });

  it("rejects branch and message-leaf conflicts", () => {
    expect(() =>
      mergeMessageCatalogs(
        { account: { preferences: "Preferences" } },
        { account: { preferences: { title: "Preferences" } } },
      ),
    ).toThrow("Catalog shape conflict at account.preferences.");
  });

  it("rejects malformed catalog nodes before merging", () => {
    expect(() => assertMessageCatalog({ account: [] })).toThrow(
      "Malformed catalog node at catalog.account: expected a message string or plain object.",
    );
    expect(() => assertMessageCatalog({ account: { title: "   " } })).toThrow(
      "Empty message at catalog.account.title.",
    );
  });

  it("accepts locale-specific plural categories while retaining arguments and tags", () => {
    const polish = {
      feature: {
        notice:
          "Przeczytaj <docs>przewodnik</docs>. {count, plural, =0 {Brak wierszy} one {# wiersz} few {# wiersze} many {# wierszy} other {# wiersza}}",
      },
    };

    expect(validateCatalogParity(english, polish)).toEqual([]);
  });

  it("rejects a changed ICU argument signature", () => {
    expect(
      validateCatalogParity(english, {
        feature: { notice: "{total, plural, one {One} other {Many}}" },
      }),
    ).toContain("feature.notice: ICU argument signature differs");
  });

  it("rejects a changed rich-text tag signature", () => {
    expect(
      validateCatalogParity(english, {
        feature: { notice: "Read the <link>guide</link>. {count, plural, one {One} other {Many}}" },
      }),
    ).toContain("feature.notice: rich-text tag signature differs");
  });

  it("requires an other plural branch", () => {
    expect(() => messageSignature("{count, plural, one {# row}}")).toThrow();
  });

  it("retains select and exact-plural branch identifiers", () => {
    const reference = {
      feature: {
        status: "{state, select, connected {Connected} failed {Failed} other {Unknown}}",
        summary: "{count, plural, =0 {No rows} one {# row} other {# rows}}",
      },
    };
    const candidate = {
      feature: {
        status: "{state, select, connected {Połączono} other {Nieznany}}",
        summary: "{count, plural, one {# wiersz} few {# wiersze} other {# wierszy}}",
      },
    };

    expect(validateCatalogParity(reference, candidate)).toEqual([
      "feature.status: select option identifiers differ",
      "feature.summary: exact plural option identifiers differ",
    ]);
  });

  it("retains plural mode and offset semantics", () => {
    const reference = {
      feature: {
        summary: "{count, plural, offset:1 =0 {No rows} one {# row} other {# rows}}",
      },
    };

    expect(
      validateCatalogParity(reference, {
        feature: {
          summary: "{count, selectordinal, offset:2 =0 {No rows} one {# row} other {# rows}}",
        },
      }),
    ).toEqual(["feature.summary: plural mode or offset differs"]);
  });
});
