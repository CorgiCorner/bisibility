import { describe, expect, it } from "vitest";
import type { AlertExternalDeliveryPayload } from "./alert-delivery-payload";
import { alertPushMessage, digestPushMessage } from "./push-content";

const payload: AlertExternalDeliveryPayload = {
  action: "Review the page.",
  afterPosition: 14,
  alertId: "al_a00000000000000000000000",
  beforePosition: 8,
  conditionType: "exits_top_n",
  firedAt: "2026-10-17T12:00:00.000Z",
  headline: "seo tool exited the top 10",
  keyword: "seo tool",
  keywordId: "kw_a00000000000000000000000",
  projectDomain: "example.com",
  projectId: "prj_a00000000000000000000000",
  ruleId: "alr_a00000000000000000000000",
  ruleName: "Slipped out of top 10",
};

describe("alert push content", () => {
  it("states the change without SERP data and links by public ids", () => {
    const message = alertPushMessage({ conditionType: "exits_top_n", topN: 10 }, payload);
    expect(message).toEqual({
      body: '"seo tool" is now #14 (was #8).',
      collapseId: "alr_a00000000000000000000000:kw_a00000000000000000000000",
      data: {
        alert_id: payload.alertId,
        keyword_id: payload.keywordId,
        project_id: payload.projectId,
        rule_id: payload.ruleId,
      },
      threadId: payload.projectId,
      title: "Keyword fell out of the top 10",
    });
    expect(Buffer.byteLength(message.collapseId)).toBeLessThanOrEqual(64);
  });

  it("titles the iOS presets", () => {
    expect(alertPushMessage({ conditionType: "enters_top_n", topN: 3 }, payload).title).toBe(
      "Keyword entered the top 3",
    );
    expect(
      alertPushMessage(
        { conditionType: "position_drop", topN: null },
        { ...payload, afterPosition: null },
      ).body,
    ).toBe('"seo tool" is now not ranked (was #8).');
    expect(alertPushMessage({ conditionType: "position_drop", topN: null }, payload).title).toBe(
      "Keyword dropped 6 positions",
    );
    expect(alertPushMessage({ conditionType: "serp_feature", topN: null }, payload)).toMatchObject({
      body: payload.headline,
      title: "Keyword alert",
    });
  });

  it("summarizes a digest in one notification", () => {
    expect(
      digestPushMessage({
        alerts: [payload, payload, payload],
        projectDomain: "example.com",
        projectId: payload.projectId,
        ruleId: payload.ruleId,
        ruleName: "Slipped out of top 10",
      }),
    ).toMatchObject({
      body: "seo tool exited the top 10 and 2 more on example.com.",
      collapseId: `${payload.ruleId}:digest`,
      title: "Slipped out of top 10: 3 keyword alerts",
    });
  });
});
