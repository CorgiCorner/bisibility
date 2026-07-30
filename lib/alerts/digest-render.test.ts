import { describe, expect, it } from "vitest";
import type { TriggeredAlertDeliveryPayload } from "./delivery";
import { renderAlertDigest } from "./digest-render";

const publicId = (prefix: string, first = "a") => `${prefix}_${first}${"0".repeat(23)}`;

function alert(index: number): TriggeredAlertDeliveryPayload {
  return {
    action: "Review the ranking change.",
    afterPosition: index + 2,
    alertId: publicId("al", index === 0 ? "a" : "b"),
    beforePosition: index + 1,
    conditionType: "position_drop",
    firedAt: "2026-07-21T10:00:00.000Z",
    headline: "Ranking changed",
    keyword: `keyword ${index}`,
    keywordId: publicId("kw"),
    projectDomain: "example.com",
    projectId: publicId("prj"),
    ruleId: publicId("alr"),
    ruleName: "Ranking drops",
  };
}

function render(alertCount: number, suppressedTodayCount: number) {
  return renderAlertDigest({
    alerts: Array.from({ length: alertCount }, (_, index) => alert(index)),
    conditionType: "position_drop",
    createdAt: new Date("2026-07-21T10:00:00.000Z"),
    projectDomain: "example.com",
    projectId: publicId("prj"),
    projectName: "Example",
    ruleId: publicId("alr"),
    ruleName: "Ranking drops",
    suppressedTodayCount,
  });
}

describe("renderAlertDigest", () => {
  it("uses singular alert grammar for one alert and one suppression", () => {
    const digest = render(1, 1);

    expect(digest.email.subject).toContain("1 alert -");
    expect(digest.email.text).toContain("1 alert suppressed after the daily delivery-batch cap");
  });

  it("uses plural alert grammar for multiple alerts and suppressions", () => {
    const digest = render(2, 2);

    expect(digest.email.subject).toContain("2 alerts -");
    expect(digest.email.text).toContain("2 alerts suppressed after the daily delivery-batch cap");
  });

  it("builds the exact v3 public-ID digest envelope", () => {
    const digest = render(1, 0);

    expect(digest.webhookBody).toEqual({
      created_at: "2026-07-21T10:00:00.000Z",
      data: {
        alert_count: 1,
        alerts: [
          {
            action: "Review the ranking change.",
            after_position: 2,
            alert_id: publicId("al"),
            before_position: 1,
            condition_type: "position_drop",
            fired_at: "2026-07-21T10:00:00.000Z",
            headline: "Ranking changed",
            keyword: "keyword 0",
            keyword_id: publicId("kw"),
            project_domain: "example.com",
            project_id: publicId("prj"),
            rule_id: publicId("alr"),
            rule_name: "Ranking drops",
          },
        ],
        condition_type: "position_drop",
        project_domain: "example.com",
        project_id: publicId("prj"),
        rule_id: publicId("alr"),
        rule_name: "Ranking drops",
        suppressed_today_count: 0,
      },
      event: "alert.digest",
      schemaVersion: 3,
    });
  });
});
