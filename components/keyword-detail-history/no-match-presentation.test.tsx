import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { observation, observationPage } from "./history.test-fixture";
import { determinateHistoryAbsence } from "./no-match-presentation";
import { ObservationHistoryTable } from "./ObservationHistoryTable";

it("shows determinate absence without rank-only unknown fields", () => {
  const record = observation(0, {
    evidence: "known_absent",
    position: null,
    reportedPosition: null,
    requestedDepth: 20,
    rankingUrl: null,
  });
  render(
    <ObservationHistoryTable
      page={{ ...observationPage(), records: [record] }}
      timeZone="UTC"
      onOpen={vi.fn()}
    />,
  );
  expect(screen.getByText("Not in top 20")).toBeVisible();
  expect(screen.queryByText("Checked top 20")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Details" }));
  expect(screen.getByText("Checked top 20")).toBeVisible();
  expect(screen.getByText("No ranked result to compare")).toBeVisible();
  expect(
    screen.queryByText(
      /No confirmed position|Freshness unknown|Comparison unknown|ranking URL: unknown/,
    ),
  ).toBeNull();
});
it("keeps unknown qualification for indeterminate coverage", () => {
  const record = observation(0, {
    evidence: "unknown",
    position: null,
    reportedPosition: null,
    requestedDepth: 20,
    completeness: "unknown",
    completeThrough: null,
    rankingUrl: null,
  });
  render(
    <ObservationHistoryTable
      page={{ ...observationPage(), records: [record] }}
      timeZone="UTC"
      onOpen={vi.fn()}
    />,
  );
  expect(screen.queryByText("Not in top 20")).toBeNull();
  expect(screen.getByText("No confirmed position")).toBeVisible();
});

it("preserves a known exit event for a determinate absence", () => {
  const record = observation(1, {
    evidence: "known_absent",
    position: null,
    reportedPosition: null,
    rankingUrl: null,
  });
  const baseline = observation(0);
  render(
    <ObservationHistoryTable
      page={{
        ...observationPage(),
        records: [record],
        resolutions: [
          {
            keywordId: record.keywordId,
            current: record,
            baseline,
            comparison: "comparable",
            comparisonBoundary: null,
            comparisonWindow: null,
            comparisonUnavailableReason: null,
            event: "exited",
            movement: null,
            lastSuccess: record,
            latestAttempt: null,
          },
        ],
      }}
      timeZone="UTC"
      onOpen={vi.fn()}
    />,
  );
  expect(screen.getByText("Exited")).toBeVisible();
  expect(screen.queryByText("No ranked result to compare")).toBeNull();
});

it("uses proven requested-depth absence when the report horizon is deeper", () => {
  expect(
    determinateHistoryAbsence(
      observation(0, {
        evidence: "unknown",
        reason: "unproven_absence",
        reportedPosition: null,
        position: null,
        requestedDepth: 20,
        normalizationVersion: "v2",
        completeThrough: 20,
      }),
    ),
  ).toBe(true);
  expect(
    determinateHistoryAbsence(
      observation(0, {
        evidence: "unknown",
        reason: "unproven_absence",
        reportedPosition: null,
        position: null,
        requestedDepth: 20,
        normalizationVersion: "v2",
        completeThrough: 19,
      }),
    ),
  ).toBe(false);
});

it("shows a recorded normalized no-match when the separate coverage receipt was not retained", () => {
  const record = observation(0, {
    evidence: "unknown",
    reason: "unproven_absence",
    reportedPosition: null,
    position: null,
    requestedDepth: 20,
    completeThrough: null,
    normalizationVersion: "v2",
  });
  expect(determinateHistoryAbsence(record, 20)).toBe(true);
  expect(determinateHistoryAbsence(record)).toBe(false);
  expect(determinateHistoryAbsence({ ...record, completeness: "unknown" }, 20)).toBe(false);
  expect(determinateHistoryAbsence({ ...record, normalizationVersion: null }, 20)).toBe(false);
});

it.each([50, 100])("does not promote known absence at 20 into absence at %s", (requestedDepth) => {
  const record = observation(0, {
    evidence: "known_absent",
    position: null,
    reportedPosition: null,
    requestedDepth,
    completeThrough: 20,
    normalizationVersion: "v2",
    rankingUrl: null,
  });
  expect(determinateHistoryAbsence(record)).toBe(false);
  expect(determinateHistoryAbsence(record, 20)).toBe(false);
  render(
    <ObservationHistoryTable
      page={{ ...observationPage(), records: [record] }}
      timeZone="UTC"
      onOpen={vi.fn()}
    />,
  );
  expect(screen.queryByText(`Not in top ${requestedDepth}`)).toBeNull();
  expect(screen.queryByText(`Checked top ${requestedDepth}`)).toBeNull();
  expect(determinateHistoryAbsence({ ...record, completeThrough: requestedDepth })).toBe(true);
});
it("does not claim known absence without retained depth proof", () => {
  const record = observation(0, {
    evidence: "known_absent",
    position: null,
    reportedPosition: null,
    requestedDepth: 50,
    completeThrough: null,
  });
  expect(determinateHistoryAbsence(record)).toBe(false);
  expect(determinateHistoryAbsence(record, 50)).toBe(true);
});
