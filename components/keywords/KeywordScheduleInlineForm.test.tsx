import { ToastProvider } from "@/components/ui";
import type { KeywordLocation, KeywordRow } from "@/lib/queries/keywords";
import { FIELD_HELP } from "@/lib/settings/field-help";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeywordScheduleInlineForm } from "./KeywordScheduleInlineForm";

function location(overrides: Partial<KeywordLocation> = {}): KeywordLocation {
  return {
    canonicalKey: "US",
    cityName: null,
    countryCode: "US",
    displayName: "United States",
    gl: "us",
    hl: "en",
    id: "loc_us",
    kind: "country",
    ...overrides,
  };
}

function keyword(overrides: Partial<KeywordRow> = {}): KeywordRow {
  const loc = overrides.location ?? location();
  return {
    bestPosition: 3,
    cpc: "0.00",
    createdAt: "2026-01-01T00:00:00.000Z",
    device: "Desktop",
    difficulty: 0,
    engine: "Google",
    hasRankData: true,
    id: "kw_1",
    keyword: "rank tracker",
    lastCheckAt: null,
    lastCheckStatus: null,
    location: loc,
    locationName: loc.displayName,
    position: 3,
    positionHistory: [],
    previousPosition: 4,
    rankingPages: 1,
    rankingPath: "/",
    rankingUrl: "https://example.com/",
    rankingUrlHistory: [],
    schedule: {
      cron_expression: null,
      frequency: "daily",
      jitter_minutes: 30,
      last_checked_at: null,
      next_check_at: null,
      timezone: "UTC",
    },
    scheduleSource: "project",
    serpFeatures: [],
    sparkline: [],
    tags: [],
    targetUrl: null,
    topic: null,
    intent: null,
    volume: 0,
    ...overrides,
    clicks: overrides.clicks ?? null,
    ctr: overrides.ctr ?? null,
    impressions: overrides.impressions ?? null,
    positionBaseline: overrides.positionBaseline === undefined ? 4 : overrides.positionBaseline,
    positionHistoryBoundaryAt: overrides.positionHistoryBoundaryAt ?? null,
  };
}

function renderForm(
  row: KeywordRow = keyword(),
  depth: {
    projectDepth?: 10 | 20 | 50 | 100;
    scheduleDepth?: 10 | 20 | 50 | 100 | null;
  } = {},
) {
  const updateKeywordScheduleAction = vi.fn(async () => undefined);
  render(
    <ToastProvider>
      <KeywordScheduleInlineForm
        keyword={row}
        projectDepth={depth.projectDepth}
        scheduleDepth={depth.scheduleDepth}
        updateKeywordScheduleAction={updateKeywordScheduleAction}
      />
    </ToastProvider>,
  );
  return { updateKeywordScheduleAction };
}

describe("KeywordScheduleInlineForm", () => {
  beforeEach(() => {
    routerMock.refresh.mockClear();
  });

  it("renders keyword schedule defaults and inherited hint", () => {
    renderForm();

    expect(screen.getByRole("button", { name: "Frequency" })).toHaveTextContent("Daily");
    expect(screen.getByRole("button", { name: "Timezone" })).toHaveTextContent("UTC");
    expect(screen.getByRole("button", { name: "SERP depth" })).toHaveTextContent(
      "Inherit (Top 100)",
    );
    expect(screen.getByLabelText("Jitter (min)")).toHaveDisplayValue("30");
    expect(screen.getByLabelText("Jitter (min)")).toHaveAttribute("max", "120");
    expect(screen.getByRole("button", { name: FIELD_HELP.frequency })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: FIELD_HELP.timezone })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: FIELD_HELP.jitter })).toBeInTheDocument();
    expect(screen.getByText("Inherits project default")).toBeInTheDocument();
  });

  it("shows an exact zero-cost estimate for the selected schedule", () => {
    const updateKeywordScheduleAction = vi.fn(async () => undefined);
    render(
      <ToastProvider>
        <KeywordScheduleInlineForm
          keyword={keyword()}
          providerRate={{ overrideCents: 0, providerId: "local-sequence" }}
          updateKeywordScheduleAction={updateKeywordScheduleAction}
        />
      </ToastProvider>,
    );

    expect(screen.getByText("~ $0.00/month")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "SERP depth" }));
    fireEvent.click(screen.getByText("Top 20"));
    expect(screen.getByText("~ $0.00/month")).toBeInTheDocument();
  });

  it("provides a searchable full timezone picker", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Timezone" }));
    const search = screen.getByRole("textbox", { name: "Search time zones..." });
    fireEvent.change(search, { target: { value: "Europe/Warsaw" } });

    expect(screen.getByText(/Europe\/Warsaw \(GMT[+-]\d{2}:\d{2}\)/)).toBeInTheDocument();
  });

  it("uses frequency as the only scheduling eligibility control", () => {
    renderForm();

    const saveButton = screen.getByRole("button", { name: "Save schedule" });

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(saveButton).toHaveClass("self-end");
  });

  it("submits a keyword depth override and warns below the project depth", async () => {
    const { updateKeywordScheduleAction } = renderForm(keyword(), {
      projectDepth: 50,
    });

    fireEvent.click(screen.getByRole("button", { name: "SERP depth" }));
    fireEvent.click(screen.getByText("Top 20"));
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));

    await waitFor(() => expect(updateKeywordScheduleAction).toHaveBeenCalledTimes(1));
    expect(updateKeywordScheduleAction).toHaveBeenCalledWith(
      expect.objectContaining({ serpDepth: 20 }),
    );
    expect(
      screen.getByText(
        "keywords ranking below 20 will be reported as not found; alerts deeper than 20 will not fire",
      ),
    ).toBeInTheDocument();
  });

  it("does not render inherited hint for fallback schedules", () => {
    renderForm(keyword({ scheduleSource: "fallback" }));

    expect(screen.queryByText("Inherits project default")).not.toBeInTheDocument();
  });

  it("renders the cron input for custom cron schedules", () => {
    renderForm(
      keyword({
        schedule: {
          cron_expression: "0 6 * * *",
          frequency: "custom_cron",
          jitter_minutes: 15,
          last_checked_at: null,
          next_check_at: null,
          timezone: "Europe/Warsaw",
        },
        scheduleSource: "keyword",
      }),
    );

    expect(screen.getByLabelText("Cron")).toHaveDisplayValue("0 6 * * *");
    expect(screen.getByRole("button", { name: FIELD_HELP.cron })).toBeInTheDocument();
    expect(screen.queryByText("Inherits project default")).not.toBeInTheDocument();
  });

  it("submits the parsed schedule payload through the action prop", async () => {
    const { updateKeywordScheduleAction } = renderForm();

    fireEvent.change(screen.getByLabelText("Jitter (min)"), {
      target: { value: "45" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));

    await waitFor(() => {
      expect(updateKeywordScheduleAction).toHaveBeenCalledTimes(1);
    });
    expect(updateKeywordScheduleAction).toHaveBeenCalledWith(
      expect.objectContaining({
        frequency: "daily",
        jitterMinutes: 45,
        keywordId: "kw_1",
        timezone: "UTC",
      }),
    );
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Schedule saved.")).toBeInTheDocument();
  });
});
