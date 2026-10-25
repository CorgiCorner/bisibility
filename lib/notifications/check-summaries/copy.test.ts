import { readFileSync } from "node:fs";
import { localeValues } from "@/i18n/config";
import { describe, expect, it } from "vitest";
import { checkSummaryCopyRenderer } from "./copy";

const summaryPayload = {
  windowStart: "2026-10-25T00:00:00Z",
  windowEnd: "2026-10-25T01:00:00Z",
  counts: { up: 2, down: 1, failed: 3, under_review: 4, unchanged: 5, new: 6 },
  linkedIncidentIds: [],
};
const manualTitles = {
  en: "Manual check summary",
  pl: "Podsumowanie ręcznego sprawdzania",
  ja: "手動チェックの概要",
  "es-ES": "Resumen de comprobación manual",
};

describe("CN-4 localized check summary copy", () => {
  it.each(localeValues)("renders both types and every count in %s at read time", async (locale) => {
    const render = await checkSummaryCopyRenderer(locale);
    expect(render("manual_run_summary", summaryPayload).title).toBe(manualTitles[locale]);
    for (const type of ["manual_run_summary", "scheduled_window_summary"] as const) {
      const copy = render(type, summaryPayload);
      expect(copy.title).not.toContain("shell.notifications");
      expect(copy.body.match(/\d/g)).toEqual(["1", "2", "3", "4", "5", "6"]);
      if (type === "scheduled_window_summary") expect(copy.title).toContain("00:00–01:00 UTC");
    }
  });
  it.each(localeValues)(
    "links incidents without repeating their review wording in %s",
    async (locale) => {
      const render = await checkSummaryCopyRenderer(locale);
      const linked = render("manual_run_summary", {
        ...summaryPayload,
        counts: { under_review: 4 },
        linkedIncidentIds: ["incident"],
      });
      const standalone = render("manual_run_summary", {
        ...summaryPayload,
        counts: { under_review: 4 },
      });
      expect(linked.body).not.toContain("4");
      expect(linked.body).toContain("1");
      expect(linked.body).not.toBe(standalone.body);
      const noRepeat = JSON.parse(readFileSync(`messages/core/${locale}/shell.json`, "utf8")).shell
        .notifications.incident.noRepeat;
      expect(linked.body).not.toContain(noRepeat);
    },
  );
  it("omits zero, negative, fractional and malformed counts", async () => {
    const render = await checkSummaryCopyRenderer("en");
    for (const count of [0, -1, 1.5, "2", null]) {
      expect(render("manual_run_summary", { counts: { up: count } }).body).toBe("");
    }
  });
});
