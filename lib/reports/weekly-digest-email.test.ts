import { expect, it, vi } from "vitest";
import shellMessages from "@/messages/core/en/shell.json";
import { incidentCopyRenderer } from "@/lib/notifications/incident-copy";
import type { ReportSummary } from "@/lib/rank-reports/model";
import type { WeeklyDigestData } from "./weekly-digest-data";
import { renderWeeklyDigestEmail } from "./weekly-digest-email";

vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }));

const mailFixture: WeeklyDigestData = {
  projectName: 'Example <&"',
  projectDomain: "example.test",
  rangeStart: new Date("2026-10-05T06:15:00Z"),
  rangeEnd: new Date("2026-10-12T06:15:00Z"),
  avgPositionDelta: 2,
  checkedKeywords: 3,
  failedChecksCount: 1,
  topMovers: [{ keyword: 'safe <&"', publicId: "kw_public", from: 5, to: 3, delta: 2 }],
  quality: {
    metric: { counts: { expected: 4, comparable: 3, unknown: 1 }, dataCoverage: 0.75 },
  } as ReportSummary,
  membership: {
    archived: "excluded",
    pausedMarkets: "excluded",
    pausedSchedules: "include_retained",
  },
};

it("distinguishes checked keywords from comparable keywords", () => {
  const email = renderWeeklyDigestEmail({
    ...mailFixture,
    avgPositionDelta: null,
    checkedKeywords: 2,
    failedChecksCount: 0,
    topMovers: [],
    quality: {
      metric: { counts: { expected: 2, comparable: 0, unknown: 0 }, dataCoverage: 1 },
    } as ReportSummary,
  });
  expect(email.text).toContain("Checked keywords: 2");
  expect(email.text).toContain("Comparable: 0");
  expect(email.text).not.toContain("Comparable keywords");
  expect(email.text).not.toContain("Checked keywords: 0");
  expect(email.html).toContain("Checked keywords: 2");
  expect(email.html).toContain("Comparable: 0");
  expect(email.html).not.toContain("Comparable keywords");
});

it("renders checked keywords separately from the comparable evidence line", () => {
  expect(renderWeeklyDigestEmail(mailFixture)).toMatchSnapshot();
});

it("renders incident-only mail with escaped counts and an absolute runs link, without quality or movers", () => {
  const email = renderWeeklyDigestEmail({
    ...mailFixture,
    incidentOnly: true,
    attention: [
      {
        change: "Reopened",
        body: `<unsafe> 2 recovered results. ${shellMessages.shell.notifications.incident.noRepeat}`,
        url: 'https://example.test/app/prj_public/runs?x="unsafe"',
      },
    ],
  });
  expect(email.subject).toBe(`Weekly rank report - ${mailFixture.projectName}`);
  expect(email.text).toContain(
    `Reopened: <unsafe> 2 recovered results. ${shellMessages.shell.notifications.incident.noRepeat}`,
  );
  expect(email.html).toContain("&lt;unsafe&gt;");
  expect(email.html).not.toContain("<unsafe>");
  expect(email.html).toContain(
    'href="https://example.test/app/prj_public/runs?x=&quot;unsafe&quot;"',
  );
  for (const field of ["Average delta", "Expected keywords", "Top movers", "Failed checks"]) {
    expect(email.text).not.toContain(field);
    expect(email.html).not.toContain(field);
  }
});

it("WD-1 renders every result and cost count using the bell wording in both mail variants", async () => {
  const render = await incidentCopyRenderer("en");
  const body = render({ resultUnderReviewCount: 1, resultRecoveredCount: 2, resultPartialCount: 3,
    resultProviderErrorCount: 4, resultMissingCount: 5, costMeasuredCount: 6, costUnknownCount: 7,
    costUnderReviewCount: 8, costConflictCount: 9 }).body;
  const email = renderWeeklyDigestEmail({ ...mailFixture, failedChecksCount: 0, attention: [
    { change: "Changed", body, url: "https://example.test/app/prj_public/runs" },
  ] });
  for (const phrase of ["1 result under review", "2 recovered results", "3 partial results", "4 provider errors",
    "5 missing results", "cost measured for 6 checks", "cost unknown for 7 checks", "cost under review for 8 checks",
    "cost conflict for 9 checks", shellMessages.shell.notifications.incident.noRepeat, "Failed checks: 0"]) {
    expect(email.text).toContain(phrase); expect(email.html).toContain(phrase);
  }
  expect(email).toMatchSnapshot();
});
