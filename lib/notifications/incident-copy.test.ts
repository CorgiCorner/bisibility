import { readFileSync } from "node:fs";
import { localeValues } from "@/i18n/config";
import { describe, expect, it } from "vitest";
import { incidentCopyRenderer, incidentCostKeys, incidentResultKeys } from "./incident-copy";

const requiredKeys = [
  "title",
  "resolved",
  "noRepeat",
  "counts",
  ...incidentResultKeys,
  ...incidentCostKeys,
];
const noRepeat = {
  en: "We did not retry these checks automatically.",
  pl: "Nie ponawialiśmy automatycznie tych sprawdzeń.",
  ja: "これらのチェックは自動で再試行していません。",
  "es-ES": "No hemos reintentado automáticamente estas comprobaciones.",
};

describe("IN-4 incident catalog contract", () => {
  it.each(localeValues)(
    "%s has all keys, no submission denial and the no-repeat sentence",
    (locale) => {
      const copy = JSON.parse(readFileSync(`messages/core/${locale}/shell.json`, "utf8")).shell
        .notifications.incident;
      expect(Object.keys(copy).sort()).toEqual([...requiredKeys].sort());
      for (const value of Object.values(copy)) {
        expect(typeof value).toBe("string");
        expect(value).not.toMatch(
          /not submitted|was never submitted|nie wysłano|nie przesłano|nie został[ao]? (?:wysłan|przesłan)|送信されていません|未送信|no se envió|no enviada|no se ha enviado la (?:tarea|solicitud)/i,
        );
      }
      expect(copy.noRepeat).toBe(noRepeat[locale]);
      for (const key of [...incidentResultKeys, ...incidentCostKeys])
        expect(copy[key]).toContain("plural,");
    },
  );
  it.each(localeValues)(
    "%s renders every result/cost dimension and resolved state",
    async (locale) => {
      const render = await incidentCopyRenderer(locale);
      for (const result of incidentResultKeys)
        for (const cost of incidentCostKeys) {
          const copy = render({ state: "open", [result]: 2, [cost]: 2 });
          expect(copy.title).toBeTruthy();
          expect(copy.body).toContain(noRepeat[locale]);
          expect(copy.body).not.toContain("shell.notifications");
          expect(copy.body.match(/2/g)).toHaveLength(2);
        }
      expect(
        render({ state: "resolved", resultRecoveredCount: 1, costUnknownCount: 1 }).body,
      ).toContain(
        JSON.parse(readFileSync(`messages/core/${locale}/shell.json`, "utf8")).shell.notifications
          .incident.resolved,
      );
    },
  );
  it("keeps recovered results independent from unknown costs", async () => {
    const render = await incidentCopyRenderer("en");
    expect(
      render({
        state: "open",
        resultRecoveredCount: 2,
        resultPartialCount: 1,
        resultUnderReviewCount: 1,
        costMeasuredCount: 3,
        costUnknownCount: 1,
      }),
    ).toEqual({
      title: "Provider evidence review",
      body: "1 result under review, 2 recovered results, 1 partial result; cost measured for 3 checks, cost unknown for 1 check. We did not retry these checks automatically.",
    });
  });
});

it.each(localeValues)("renders account incident notifications in %s", async (locale) => {
  const render = await incidentCopyRenderer(locale);
  const open = render({ kind: "account_block", provider: "SerpApi", state: "open" });
  const resolved = render({ kind: "account_block", provider: "SerpApi", state: "resolved" });
  expect(open.title).toContain("SerpApi");
  expect(resolved.title).toContain("SerpApi");
  expect(open.title).not.toBe(resolved.title);
  expect(open.body).not.toContain("shell.notifications");
  expect(
    render({ kind: "account_block", provider: "SerpApi", state: "open", reason: "provider_auth" })
      .body,
  ).not.toBe(
    render({
      kind: "account_block",
      provider: "SerpApi",
      state: "open",
      reason: "provider_billing",
    }).body,
  );
});
