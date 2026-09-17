import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { ToastProvider } from "@/components/ui/Toast";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { KeywordRow } from "@/lib/queries/keywords";
import rankTrackerMessages from "@/messages/core/en/project-rank-tracker.json";
import keywordImportMessages from "@/messages/core/en/project-rank-tracker-keyword-import.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetScheduleModal } from "./SetScheduleModal";
import type { CheckScheduleSummary } from "./set-schedule-model";

const projectId = "prj_schedule_modal";
const rows = [keywordRows[0] as KeywordRow];
const schedules = [
  {
    cronExpression: "0 6 * * *",
    enabled: true,
    frequency: "daily",
    isDefault: true,
    jitterMinutes: 60,
    keywordCount: 16,
    name: "Daily 06:00",
    publicId: "sch_daily",
    serpDepth: null,
    timeOfDay: "06:00",
    timezone: "UTC",
  },
  {
    cronExpression: "0 6 * * 1",
    enabled: true,
    frequency: "weekly",
    isDefault: false,
    jitterMinutes: 60,
    keywordCount: 8,
    name: "Weekly Mon",
    publicId: "sch_weekly",
    serpDepth: null,
    timeOfDay: "06:00",
    timezone: "UTC",
  },
] satisfies CheckScheduleSummary[];

function renderModal(overrides: Partial<React.ComponentProps<typeof SetScheduleModal>> = {}) {
  return render(
    <ToastProvider>
      <SetScheduleModal
        currentScheduleId="sch_daily"
        onClose={vi.fn()}
        onDone={vi.fn()}
        open
        projectId={projectId}
        providerRate={{ overrideCents: 1, providerId: "dataforseo" }}
        schedules={schedules}
        selectedRows={rows}
        {...overrides}
      />
    </ToastProvider>,
  );
}

function renderPolish(children: ReactNode) {
  const messages = {
    ...keywordImportMessages,
    projectRankTracker: {
      ...keywordImportMessages.projectRankTracker,
      keywordImport: {
        ...keywordImportMessages.projectRankTracker.keywordImport,
        management: {
          ...keywordImportMessages.projectRankTracker.keywordImport.management,
          schedule: {
            ...keywordImportMessages.projectRankTracker.keywordImport.management.schedule,
            ariaLabel: "Harmonogram",
            create: "Utwórz harmonogram",
            daily: "Codziennie",
            depth: "Głębokość",
            depthProviderHint: "Głębokość i dostawca wynikają z ustawień projektu.",
            name: "Nazwa",
            new: "Nowy harmonogram",
            newDescription: "Nowy rytm dla {count, plural, one {tego celu.} other {tych # celów.}}",
            newTitle: "Nowy harmonogram z wyboru",
            monthlyDelta:
              "{direction, select, positive {Więcej o +{cost, number, ::currency/USD} miesięcznie} negative {Mniej o -{cost, number, ::currency/USD} miesięcznie} other {Bez zmiany}}",
            monthlyDeltaBelowCent:
              "{direction, select, positive {Więcej o +< {minimum, number, ::currency/USD} miesięcznie} negative {Mniej o -< {minimum, number, ::currency/USD} miesięcznie} other {Bez zmiany}}",
            monthlyNoSpend: "Brak zaplanowanych kosztów",
            monthlySame: "Ten sam koszt miesięczny",
            monthlyUnavailable: "Wycena niedostępna",
            projectDefaultDepth: "Domyślna głębokość (Top {depth, number})",
            saveForbidden: "Nie masz dostępu do zmiany tych harmonogramów.",
            saveNotFound: "Ten harmonogram nie jest już dostępny. Odśwież i wybierz go ponownie.",
            saveUnauthorized: "Zaloguj się ponownie, a następnie zapisz harmonogram.",
            saveValidationFailed: "Sprawdź pola harmonogramu i spróbuj ponownie.",
            timezone: "Strefa czasowa",
            title:
              "Ustaw harmonogram dla {count, plural, one {# słowa kluczowego / # celu} few {# słów kluczowych / # celów} many {# słów kluczowych / # celów} other {# słowa kluczowego / # celu}}",
          },
        },
      },
    },
  };
  return render(
    <FeatureMessagesProvider
      locale="pl"
      messages={mergeMessageCatalogs(sharedMessages, rankTrackerMessages, messages)}
      timeZone="UTC"
    >
      {children}
    </FeatureMessagesProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

function problemResponse(
  status: number,
  code: "forbidden" | "not_found" | "unauthorized" | "validation_failed",
) {
  return new Response(
    JSON.stringify({
      detail: "Raw server detail must not reach the interface.",
      docs_url: `https://bisibility.com/docs/api/errors#${code}`,
      instance: "urn:bisibility:app:rank-check-runs:error",
      status,
      title: "Server response",
      type: `https://bisibility.com/problems/${code}`,
    }),
    { status },
  );
}

describe("SetScheduleModal", () => {
  it("radiogroup", () => {
    renderModal();
    expect(screen.getByRole("radiogroup", { name: "Schedule" })).toBeInTheDocument();
  });

  it("CURRENT disabled", () => {
    renderModal();
    expect(screen.getAllByRole("radio")[0]).toBeDisabled();
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("monthly delta", () => {
    renderModal();
    expect(screen.getAllByText(/[+-]\$.*\/ month/).length).toBeGreaterThan(0);
  });

  it('"Next:" per option', () => {
    renderModal();
    expect(screen.getAllByText(/^Next:/)).toHaveLength(schedules.length);
    expect(screen.getByText("Next: Daily, 06:00")).toBeInTheDocument();
    expect(screen.getByText("Next: Mondays, 06:00")).toBeInTheDocument();
  });

  it("shows schedule skeleton rows and disables Save while schedules load", () => {
    renderModal({
      currentScheduleId: null,
      initialChoice: "sch_weekly",
      scheduleLoadState: "loading",
    });

    expect(screen.getAllByTestId("schedule-choice-skeleton")).toHaveLength(2);
    expect(screen.queryByText("Daily 06:00")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("keeps the static choices usable when schedules fail to load", () => {
    renderModal({
      initialChoice: "remove",
      scheduleLoadError: "unknown",
      scheduleLoadState: "error",
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load schedules. Try again.");
    expect(screen.getByRole("button", { name: /^New schedule/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Remove" })).toBeEnabled();
  });

  it('"Remove from schedule" under a divider', () => {
    renderModal();
    const remove = screen.getByRole("radio", { name: /Remove from schedule/ });
    expect(remove.closest("label")?.previousElementSibling).toHaveClass("bg-border");
  });

  it("CTA from choice", () => {
    renderModal();
    fireEvent.click(screen.getByRole("radio", { name: /Weekly Mon/ }));
    expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
    fireEvent.click(screen.getByRole("radio", { name: /Remove from schedule/ }));
    expect(screen.getByRole("button", { name: "Remove" })).toBeEnabled();
  });

  it("disables removal when the selection has no schedule", () => {
    renderModal({ currentScheduleId: null });
    expect(screen.getByRole("radio", { name: /Remove from schedule/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(screen.queryByText(/move from their current schedule/)).not.toBeInTheDocument();
  });

  it("explains why removal is unavailable for targets from different schedules", () => {
    renderModal({
      currentScheduleId: null,
      selectedRows: [
        {
          ...rows[0],
          checkSchedule: { name: "Daily 06:00", publicId: "sch_daily", nextCheckAt: null },
        },
        {
          ...rows[0],
          id: "kw_2",
          checkSchedule: { name: "Weekly Mon", publicId: "sch_weekly", nextCheckAt: null },
        },
      ],
    });
    expect(screen.getByRole("radio", { name: /Remove from schedule/ })).toBeDisabled();
    expect(
      screen.getByText("Select targets from one schedule to remove them."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/already run on request/)).not.toBeInTheDocument();
  });

  it("removes assigned targets through their current schedule membership route", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ data: { updated: 1 } }),
      ok: true,
    }));
    vi.stubGlobal("fetch", fetchMock);
    const onDone = vi.fn();
    renderModal({ onDone });
    fireEvent.click(screen.getByRole("radio", { name: /Remove from schedule/ }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/check-schedules/sch_daily/keywords",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ keywordIds: rows.map((row) => row.id), projectId }),
      }),
    );
  });

  it("keeps an initial removal choice disabled without an assigned schedule", () => {
    renderModal({ currentScheduleId: null, initialChoice: "remove" });
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
  });

  it("returns from a new schedule to the previous choice and can apply it", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ data: { updated: 1 } }),
      ok: true,
    }));
    vi.stubGlobal("fetch", fetchMock);
    renderModal();
    fireEvent.click(screen.getByRole("radio", { name: /Weekly Mon/ }));
    fireEvent.click(screen.getByRole("button", { name: /^New schedule/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("radio", { name: /Weekly Mon/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/check-schedules/sch_weekly/keywords",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("title counts keywords and targets", () => {
    renderModal();
    expect(
      screen.getByRole("heading", { name: "Set schedule for 1 keyword / 1 target" }),
    ).toBeInTheDocument();
  });

  it("one right edge", () => {
    renderModal();
    expect(screen.getAllByRole("radio")[1]?.closest("label")).toHaveClass(
      "grid-cols-[15px_minmax(0,1fr)_minmax(0,1fr)]",
    );
  });

  it("2-line rows", () => {
    renderModal();
    expect(screen.getByText("All 1 target move from Daily 06:00.")).toBeInTheDocument();
    expect(screen.getByText("Next: Mondays, 06:00")).toBeInTheDocument();
  });

  it("uses target grammar and a removal savings label", () => {
    renderModal({ selectedRows: [...rows, { ...rows[0], id: "kw_2" }] });

    expect(screen.getByText("New cadence for these 2 targets.")).toBeInTheDocument();
    expect(
      (
        screen.getByRole("radio", { name: /Remove from schedule/ }).closest("label")?.textContent ??
        ""
      )
        .replace(/\s+/g, " ")
        .trim(),
    ).toMatch(/-\$.*\/ month/);
  });

  it("uses singular target grammar for a new schedule", () => {
    renderModal();

    expect(screen.getByText("New cadence for this target.")).toBeInTheDocument();
  });

  it("Manage schedules muted in footer", () => {
    renderModal();
    expect(screen.getByRole("link", { name: "Manage schedules" })).toHaveClass("text-fg-muted");
  });

  it("calls the schedule create and assignment routes from the new-schedule form", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ data: { publicId: "sch_new" } }), ok: true })
      .mockResolvedValueOnce({ json: async () => ({ data: { updated: 1 } }), ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const onDone = vi.fn();
    renderModal({ initialView: "new", onDone });

    fireEvent.click(screen.getByRole("button", { name: "Create schedule" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/check-schedules");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/check-schedules/sch_new/keywords");
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it("uses an injected non-English payload for list-invoked schedule controls", () => {
    renderPolish(
      <ToastProvider>
        <SetScheduleModal
          initialView="new"
          onClose={vi.fn()}
          onDone={vi.fn()}
          open
          projectId={projectId}
          schedules={schedules}
          selectedRows={[{ ...rows[0], projectSerpDepth: 20 } as KeywordRow]}
        />
      </ToastProvider>,
    );

    expect(screen.getByRole("dialog", { name: "Nowy harmonogram z wyboru" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Nazwa" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Codziennie" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Strefa czasowa" })).toBeInTheDocument();
    expect(screen.getByText("Głębokość:")).toBeInTheDocument();
    expect(screen.getByText(/Domyślna głębokość \(Top/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Utwórz harmonogram" })).toBeInTheDocument();
  });

  it.each([
    [401, "unauthorized", "Zaloguj się ponownie, a następnie zapisz harmonogram."],
    [403, "forbidden", "Nie masz dostępu do zmiany tych harmonogramów."],
    [404, "not_found", "Ten harmonogram nie jest już dostępny. Odśwież i wybierz go ponownie."],
    [400, "validation_failed", "Sprawdź pola harmonogramu i spróbuj ponownie."],
  ] as const)(
    "maps a %i %s app-route problem to a safe localized remedy",
    async (status, code, remedy) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(problemResponse(status, code)));
      renderPolish(
        <ToastProvider>
          <SetScheduleModal
            currentScheduleId="sch_daily"
            onClose={vi.fn()}
            onDone={vi.fn()}
            open
            projectId={projectId}
            providerRate={{ overrideCents: 1, providerId: "dataforseo" }}
            schedules={schedules}
            selectedRows={rows}
          />
        </ToastProvider>,
      );

      fireEvent.click(screen.getByRole("radio", { name: /Weekly Mon/ }));
      fireEvent.click(screen.getByRole("button", { name: "Apply" }));

      expect(await screen.findByText(remedy)).toBeVisible();
      expect(
        screen.queryByText("Raw server detail must not reach the interface."),
      ).not.toBeInTheDocument();
    },
  );

  it("keeps positive, negative, subcent, zero, and unavailable monthly deltas localized", () => {
    const manualRow = {
      ...rows[0],
      checkSchedule: null,
      schedule: { ...rows[0].schedule, frequency: "manual" as const },
    };
    const positive = renderPolish(
      <ToastProvider>
        <SetScheduleModal
          currentScheduleId={null}
          onClose={vi.fn()}
          onDone={vi.fn()}
          open
          projectId={projectId}
          providerRate={{ overrideCents: 1, providerId: "dataforseo" }}
          schedules={schedules}
          selectedRows={[manualRow]}
        />
      </ToastProvider>,
    );
    expect(screen.getAllByText(/Więcej o \+.*USD/).length).toBeGreaterThan(0);
    positive.unmount();

    const negative = renderPolish(
      <ToastProvider>
        <SetScheduleModal
          currentScheduleId="sch_daily"
          onClose={vi.fn()}
          onDone={vi.fn()}
          open
          projectId={projectId}
          providerRate={{ overrideCents: 1, providerId: "dataforseo" }}
          schedules={schedules}
          selectedRows={rows}
        />
      </ToastProvider>,
    );
    expect(screen.getAllByText(/Mniej o -.*USD/).length).toBeGreaterThan(0);
    negative.unmount();

    const positiveSubcent = renderPolish(
      <ToastProvider>
        <SetScheduleModal
          currentScheduleId={null}
          onClose={vi.fn()}
          onDone={vi.fn()}
          open
          projectId={projectId}
          providerRate={{ overrideCents: 0.001, providerId: "dataforseo" }}
          schedules={schedules}
          selectedRows={[manualRow]}
        />
      </ToastProvider>,
    );
    expect(screen.getAllByText(/Więcej o \+<.*USD/).length).toBeGreaterThan(0);
    positiveSubcent.unmount();

    const negativeSubcent = renderPolish(
      <ToastProvider>
        <SetScheduleModal
          currentScheduleId="sch_daily"
          onClose={vi.fn()}
          onDone={vi.fn()}
          open
          projectId={projectId}
          providerRate={{ overrideCents: 0.001, providerId: "dataforseo" }}
          schedules={schedules}
          selectedRows={rows}
        />
      </ToastProvider>,
    );
    expect(screen.getAllByText(/Mniej o -<.*USD/).length).toBeGreaterThan(0);
    negativeSubcent.unmount();

    const zero = renderPolish(
      <ToastProvider>
        <SetScheduleModal
          currentScheduleId="sch_daily"
          onClose={vi.fn()}
          onDone={vi.fn()}
          open
          projectId={projectId}
          providerRate={{ overrideCents: 0, providerId: "dataforseo" }}
          schedules={schedules}
          selectedRows={rows}
        />
      </ToastProvider>,
    );
    expect(screen.getAllByText("Ten sam koszt miesięczny").length).toBeGreaterThan(0);
    zero.unmount();

    renderPolish(
      <ToastProvider>
        <SetScheduleModal
          currentScheduleId="sch_daily"
          onClose={vi.fn()}
          onDone={vi.fn()}
          open
          projectId={projectId}
          schedules={schedules}
          selectedRows={rows}
        />
      </ToastProvider>,
    );
    expect(screen.getAllByText("Wycena niedostępna").length).toBeGreaterThan(0);
  });
});
