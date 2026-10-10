import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import onboardingMessages from "@/messages/core/en/onboarding.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { act, screen } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstCheckResults } from "./FirstCheckResults";
import type { TrackedFirstCheck } from "./first-check-progress";
import { createFirstCheckRunStore } from "./first-check-run-store";
import type { FirstCheckRunState } from "./use-first-check-run";

const polishMessages = mergeMessageCatalogs(sharedMessages, {
  onboarding: {
    ...onboardingMessages.onboarding,
    firstCheck: {
      ...onboardingMessages.onboarding.firstCheck,
      results: {
        ...onboardingMessages.onboarding.firstCheck.results,
        completed: `{completed, number} z {total, number} · \${cost, number, ::.0000}`,
        completedUnavailable: "{completed, number} z {total, number} · Koszt niedostepny",
        completedWithOutcomes:
          "{completed, number} z {total, number} kontroli zakonczono. Sprawdz pozostale statusy.",
        failure: {
          blocked: "Kontrola jest zablokowana.",
          budgetExhausted: "Limit budzetu",
          cancelled: "Kontrola zostala anulowana.",
          client: "Blad klienta",
          deferred: "Kontrola zostala odlozona.",
          failed: "Blad sprawdzenia",
          noProvider: "Brak dostawcy",
          projectReadOnly: "Projekt tylko do odczytu",
          rateLimited: "Limit dostawcy",
          sampleProject: "Projekt przykladowy",
          sendUnconfirmed:
            "Nie potwierdzono wyslania kontroli, dlatego nie zostala ponowiona. Uruchom ja ponownie, jesli jej potrzebujesz.",
          skipped: "Kontrola zostala pominieta.",
          unexpected: "Blad po stronie serwera",
        },
      },
    },
  },
});

function failed(code: Extract<FirstCheckRunState["rows"][number], { status: "failed" }>["code"]) {
  return {
    code,
    keywordId: code,
    market: { languageLabel: "English", locationLabel: "United States" },
    message: "untranslated server text",
    publicId: code,
    status: "failed" as const,
    text: code,
    device: "desktop" as const,
  };
}

type FirstCheckRunStore = ReturnType<typeof createFirstCheckRunStore>;

function PollingResults({ store }: Readonly<{ store: FirstCheckRunStore }>) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return <FirstCheckResults onRetryFailed={vi.fn()} state={state} />;
}

const queued: TrackedFirstCheck = {
  device: "desktop",
  keywordId: "keyword_1",
  market: { languageLabel: "English", locationLabel: "United States" },
  publicId: "kw_1",
  runId: "rcr_1",
  status: "queued",
  text: "rank tracker",
};

describe("FirstCheckResults", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("maps every stable failed-preview code without displaying server English", () => {
    const state: FirstCheckRunState = {
      message: null,
      mode: "preview",
      rows: [
        failed("budget_exhausted"),
        failed("failed"),
        failed("no_provider"),
        failed("project_read_only"),
        failed("rate_limited"),
        failed("sample_project"),
        failed("unexpected"),
      ],
      status: "completed",
    };
    renderWithFeatureMessages(<FirstCheckResults state={state} />, {
      locale: "pl",
      messages: polishMessages,
    });

    for (const copy of [
      "Limit budzetu",
      "Blad sprawdzenia",
      "Brak dostawcy",
      "Projekt tylko do odczytu",
      "Limit dostawcy",
      "Projekt przykladowy",
      "Blad po stronie serwera",
    ]) {
      expect(screen.getByText(copy)).toBeInTheDocument();
    }
    expect(screen.queryByText("untranslated server text")).not.toBeInTheDocument();
  });

  it("keeps a four-decimal USD aggregate with locale number punctuation and distinguishes unavailable cost", () => {
    const completed = {
      keywordId: "keyword_1",
      market: { languageLabel: "English", locationLabel: "United States" },
      position: 1,
      provider: "dataforseo",
      publicId: "kw_1",
      rankingUrl: null,
      recordedCostCents: 0.4,
      requestedDepth: 20,
      status: "completed" as const,
      text: "rank tracker",
      device: "desktop" as const,
    };
    const state: FirstCheckRunState = {
      message: null,
      mode: "preview",
      rows: [completed],
      status: "completed",
    };
    const view = renderWithFeatureMessages(<FirstCheckResults state={state} />, {
      locale: "pl",
      messages: polishMessages,
    });
    expect(screen.getByText("1 z 1 · $0,0040")).toBeInTheDocument();

    view.rerender(
      <FirstCheckResults state={{ ...state, rows: [{ ...completed, recordedCostCents: null }] }} />,
    );
    expect(screen.getByText("1 z 1 · Koszt niedostepny")).toBeInTheDocument();
  });

  it("renders a polled send-unconfirmed outcome from its structured status without retrying it", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        data: [
          {
            blockedReason: "send_unconfirmed",
            keyword: { publicId: "kw_1" },
            rankCheck: null,
            status: "blocked",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const store = createFirstCheckRunStore();
    store.setState({ message: null, mode: "preview", rows: [queued], status: "queued" });
    renderWithFeatureMessages(<PollingResults store={store} />, {
      locale: "pl",
      messages: polishMessages,
    });
    store.track("prj_1", queued);

    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(
      screen.getByText(
        "Nie potwierdzono wyslania kontroli, dlatego nie zostala ponowiona. Uruchom ja ponownie, jesli jej potrzebujesz.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Not confirmed")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry failed" })).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps each known polled terminal state distinct at the localized results boundary", () => {
    const target = {
      device: "desktop" as const,
      market: { languageLabel: "English", locationLabel: "United States" },
    };
    const state: FirstCheckRunState = {
      message: null,
      mode: "preview",
      rows: [
        {
          ...target,
          blockedReason: null,
          keywordId: "blocked",
          publicId: "kw_blocked",
          status: "blocked",
          text: "blocked",
        },
        {
          ...target,
          blockedReason: null,
          keywordId: "cancelled",
          publicId: "kw_cancelled",
          status: "cancelled",
          text: "cancelled",
        },
        {
          ...target,
          blockedReason: null,
          keywordId: "deferred",
          publicId: "kw_deferred",
          status: "deferred",
          text: "deferred",
        },
        {
          ...target,
          blockedReason: null,
          keywordId: "failed",
          publicId: "kw_failed",
          status: "failed",
          text: "failed",
        },
        {
          ...target,
          blockedReason: null,
          keywordId: "skipped",
          publicId: "kw_skipped",
          status: "skipped",
          text: "skipped",
        },
      ],
      status: "completed",
    };

    renderWithFeatureMessages(<FirstCheckResults state={state} />, {
      locale: "pl",
      messages: polishMessages,
    });

    for (const copy of [
      "Kontrola jest zablokowana.",
      "Kontrola zostala anulowana.",
      "Kontrola zostala odlozona.",
      "Blad sprawdzenia",
      "Kontrola zostala pominieta.",
    ]) {
      expect(screen.getByText(copy)).toBeInTheDocument();
    }
  });
});

it.each(["unknown", "truncated_by_stop_on_match"] as const)(
  "renders %s coverage without inventing an out-of-depth result",
  (observationCompleteness) => {
    renderWithFeatureMessages(
      <FirstCheckResults
        state={{
          mode: "preview",
          message: null,
          status: "completed",
          rows: [
            {
              ...queued,
              status: "completed",
              position: null,
              rankingUrl: null,
              provider: "dataforseo",
              recordedCostCents: 0.4,
              requestedDepth: 100,
              observationCompleteness,
            },
          ],
        }}
      />,
      { locale: "en", messages: mergeMessageCatalogs(sharedMessages, onboardingMessages) },
    );
    expect(screen.getByText("Coverage unknown")).toBeInTheDocument();
    expect(screen.queryByText("Not in top 100")).not.toBeInTheDocument();
  },
);
