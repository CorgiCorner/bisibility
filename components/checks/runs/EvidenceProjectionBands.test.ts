import { readFileSync } from "node:fs";
import { localeValues } from "@/i18n/config";
import { describe, expect, it } from "vitest";

// Keep the submission-denial guard aligned with lib/notifications/incident-copy.test.ts.
const forbiddenIncidentPhrase =
  /not submitted|was never submitted|nie wysłano|nie przesłano|nie został[ao]? (?:wysłan|przesłan)|送信されていません|未送信|no se envió|no enviada|no se ha enviado la (?:tarea|solicitud)/i;
const descriptions = ["under_reviewDescription", "provider_errorDescription", "missingDescription"];

describe.each(localeValues)("evidence projection descriptions: %s", (locale) => {
  const evidence = JSON.parse(
    readFileSync(`messages/core/${locale}/project-rank-tracker.json`, "utf8"),
  ).projectRankTracker.checks.evidence;
  const noRepeat = JSON.parse(readFileSync(`messages/core/${locale}/shell.json`, "utf8")).shell
    .notifications.incident.noRepeat;

  it.each(descriptions)("%s ends with the approved incident sentence", (key) => {
    expect.soft(evidence[key].endsWith(noRepeat)).toBe(true);
    expect.soft(evidence[key]).not.toMatch(forbiddenIncidentPhrase);
  });
});
