import type { TriggeredAlertFeedView } from "@/lib/alerts/alert-data";
import projectAlertsMessages from "@/messages/core/en/project-alerts.json";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { presentAlertFeed, presentAlertFeedFacetOptions } from "./alert-feed-presentation";

const alert = {
  afterPosition: 12,
  beforePosition: null,
  condition: {
    changePct: null,
    competitorDomain: null,
    dropPositions: 5,
    serpFeature: null,
    thresholdPosition: null,
    topN: null,
  },
  conditionType: "position_drop",
  deliveryAttempts: [
    {
      attemptedAt: "2026-07-15T11:55:00.000Z",
      channel: "webhook",
      error: null,
      status: "sent",
      webhookEndpoint: null,
    },
  ],
  deliveryState: "delivered",
  device: "desktop",
  firedAt: "2026-07-15T11:54:00.000Z",
  id: "al_abcdefghijklmnopqrstuvwx",
  keyword: "rank tracker",
  rule: "Position drop",
  severity: "warning",
  feedMeta: {
    engine: "Google",
    language: "English",
    market: { id: "pmkt_warsaw", label: "Warsaw, Poland" },
    severity: "warning",
    source: "RANK",
  },
  unread: true,
} as const satisfies TriggeredAlertFeedView;

describe("presentAlertFeed", () => {
  it("localizes raw alert codes, positions, delivery state, and relative times without stored prose", () => {
    const messages = structuredClone(projectAlertsMessages);
    messages.projectAlerts.feed.deletedEndpoint = "Usuniety punkt";
    messages.projectAlerts.feed.headlinePositionDrop =
      "{keyword}: spadek o {positions, number} {positions, plural, one {pozycje} other {pozycji}}";
    messages.projectAlerts.feed.noRank = "Brak pozycji";
    messages.projectAlerts.feed.rankPosition = "Pozycja {position, number}";
    messages.projectAlerts.feed.minutesAgo = "{count, number} min temu";
    messages.projectAlerts.feed.attemptStatusSent = "Wyslano";
    messages.projectAlerts.feed.metadataEngineGoogle = "Wyszukiwarka Google";
    messages.projectAlerts.feed.metadataSourceRank = "Kontrola pozycji";
    messages.projectAlerts.feed.severityWarning = "Ostrzezenie";
    const t = createTranslator({
      locale: "pl",
      messages,
      namespace: "projectAlerts.feed",
    });

    expect(
      presentAlertFeed(alert, t, new Date("2026-07-15T12:00:00.000Z").getTime()),
    ).toMatchObject({
      current: "Pozycja 12",
      deliveryAttempts: [
        {
          endpoint: "Usuniety punkt",
          status: "Wyslano",
          when: "5 min temu",
        },
      ],
      headline: "rank tracker: spadek o 5 pozycji",
      metadata: {
        engine: "Wyszukiwarka Google",
        language: "English",
        market: { id: "pmkt_warsaw", label: "Warsaw, Poland" },
        severity: "Ostrzezenie",
        source: "Kontrola pozycji",
      },
      previous: "Brak pozycji",
      when: "6 min temu",
    });
  });

  it("localizes generated filter options without changing stored market or language labels", () => {
    const messages = structuredClone(projectAlertsMessages);
    messages.projectAlerts.feed.metadataEngineGoogle = "Wyszukiwarka Google";
    messages.projectAlerts.feed.metadataModuleRank = "Kontrola pozycji";
    messages.projectAlerts.feed.severityUrgent = "Pilne";
    const t = createTranslator({ locale: "pl", messages, namespace: "projectAlerts.feed" });

    expect(
      presentAlertFeedFacetOptions(
        {
          engine: [{ label: "Google", value: "google" }],
          language: [{ label: "English", value: "English" }],
          market: [{ label: "Warsaw, Poland", value: "pmkt_warsaw" }],
          module: [{ label: "Rank", value: "rank" }],
          severity: [{ label: "Urgent", value: "urgent" }],
        },
        t,
      ),
    ).toEqual({
      engine: [{ label: "Wyszukiwarka Google", value: "google" }],
      language: [{ label: "English", value: "English" }],
      market: [{ label: "Warsaw, Poland", value: "pmkt_warsaw" }],
      module: [{ label: "Kontrola pozycji", value: "rank" }],
      severity: [{ label: "Pilne", value: "urgent" }],
    });
  });
});
