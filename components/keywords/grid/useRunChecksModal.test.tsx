import {
  SessionSpendProvider,
  useSessionSpend,
} from "@/components/cost-estimate/SessionSpendProvider";
import type { RunCheckNowAction } from "@/components/keywords/action-utils";
import type { RankCheckBatchPollAction } from "@/components/keywords/use-rank-check-batch-poll";
import {
  featureMessagesElement,
  projectRankTrackerFeatureTestMessages,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { act, fireEvent, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RunChecksConfirmationModal } from "./RunChecksConfirmationModal";
import { useRunChecksModal } from "./useRunChecksModal";

const CHECK_ID = "rcr_abcdefghijklmnopqrstuvwx";
const wrapper = ({ children }: { children: ReactNode }) =>
  featureMessagesElement(<SessionSpendProvider>{children}</SessionSpendProvider>, {
    messages: projectRankTrackerFeatureTestMessages,
  });

function RunChecksModalProbe({ pollAction }: { pollAction: RankCheckBatchPollAction }) {
  const modal = useRunChecksModal({
    onSettled: vi.fn(),
    pollAction,
    projectId: "prj_abcdefghijklmnopqrstuvwx",
    rows: [],
    runCheckNowAction: vi
      .fn<RunCheckNowAction>()
      .mockResolvedValue({ status: "queued", runId: CHECK_ID }),
  });

  return (
    <>
      <button onClick={() => modal.request(["kw_abcdefghijklmnopqrstuvwx"])} type="button">
        Start
      </button>
      <RunChecksConfirmationModal
        flow={modal.flow}
        onClose={modal.close}
        onConfirm={modal.confirm}
        onRetry={modal.retry}
        projectId="prj_abcdefghijklmnopqrstuvwx"
        rows={[]}
      />
    </>
  );
}

describe("useRunChecksModal", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not add estimated session spend when a queued check is accepted", async () => {
    const { result } = renderHook(
      () => ({
        ...useRunChecksModal({
          onSettled: vi.fn(),
          pollAction: vi.fn().mockResolvedValue([]),
          projectId: "prj_abcdefghijklmnopqrstuvwx",
          providerRate: { overrideCents: 2, providerId: "dataforseo" },
          rows: [],
          runCheckNowAction: vi
            .fn<RunCheckNowAction>()
            .mockResolvedValue({ status: "queued", runId: CHECK_ID }),
        }),
        sessionCents: useSessionSpend().sessionCents,
      }),
      { wrapper },
    );

    act(() => result.current.request(["kw_abcdefghijklmnopqrstuvwx"]));
    await act(async () => result.current.confirm());

    expect(result.current.flow?.step).toBe("running");
    expect(result.current.sessionCents).toBe(0);
  });

  it("keeps batch polling after the running modal closes and refreshes on terminal", async () => {
    const onSettled = vi.fn();
    const pollAction = vi.fn().mockResolvedValue([
      {
        error: null,
        errorCode: null,
        finishedAt: "2026-08-21T12:00:00.000Z",
        position: 2,
        rankCheckId: CHECK_ID,
        requestedDepth: 20,
        status: "completed",
      },
    ]);
    const runCheckNowAction = vi
      .fn<RunCheckNowAction>()
      .mockResolvedValue({ status: "queued", runId: CHECK_ID });
    const { result } = renderHook(
      () =>
        useRunChecksModal({
          onSettled,
          pollAction,
          projectId: "prj_abcdefghijklmnopqrstuvwx",
          rows: [],
          runCheckNowAction,
        }),
      { wrapper },
    );

    act(() => result.current.request(["kw_abcdefghijklmnopqrstuvwx"]));
    await act(async () => result.current.confirm());
    expect(result.current.flow?.step).toBe("running");
    act(() => result.current.close());
    expect(result.current.flow).toBeNull();

    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(pollAction).toHaveBeenCalledWith({
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      rankCheckIds: [CHECK_ID],
    });
    expect(onSettled).toHaveBeenCalledTimes(2);
    expect(result.current.flow).toBeNull();
  });
  it("settles a check that disappears from the project-scoped poll result", async () => {
    const onSettled = vi.fn();
    const pollAction = vi.fn().mockResolvedValue([]);
    const runCheckNowAction = vi
      .fn<RunCheckNowAction>()
      .mockResolvedValue({ status: "queued", runId: CHECK_ID });
    const { result } = renderHook(
      () =>
        useRunChecksModal({
          onSettled,
          pollAction,
          projectId: "prj_abcdefghijklmnopqrstuvwx",
          rows: [],
          runCheckNowAction,
        }),
      { wrapper },
    );

    act(() => result.current.request(["kw_abcdefghijklmnopqrstuvwx"]));
    await act(async () => result.current.confirm());
    await act(async () => vi.advanceTimersByTimeAsync(2000));

    expect(result.current.flow).toMatchObject({
      failures: [
        expect.objectContaining({
          message: "The rank check is no longer available.",
          rankCheckId: CHECK_ID,
        }),
      ],
      rankCheckIds: [],
      step: "failed",
    });
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(pollAction).toHaveBeenCalledTimes(1);
  });
  it("maps deferred terminal status to the explicit neutral presentation", async () => {
    const pollAction = vi.fn().mockResolvedValue([
      {
        error: "raw deferred detail",
        errorCode: "provider_auth",
        finishedAt: null,
        position: null,
        rankCheckId: CHECK_ID,
        requestedDepth: null,
        status: "deferred",
      },
    ]);
    const runCheckNowAction = vi
      .fn<RunCheckNowAction>()
      .mockResolvedValue({ status: "queued", runId: CHECK_ID });
    const { result } = renderHook(
      () =>
        useRunChecksModal({
          onSettled: vi.fn(),
          pollAction,
          projectId: "prj_abcdefghijklmnopqrstuvwx",
          rows: [],
          runCheckNowAction,
        }),
      { wrapper },
    );
    act(() => result.current.request(["kw_abcdefghijklmnopqrstuvwx"]));
    await act(async () => result.current.confirm());
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(result.current.flow).toMatchObject({
      failures: [
        {
          code: "rank_check_deferred",
          message:
            "The rank check was deferred and did not complete. View check details for more information, then try again when the blocking condition is resolved.",
          rankCheckId: CHECK_ID,
        },
      ],
      step: "failed",
    });
  });

  it("normalizes a legacy provider restriction before localized polling state reaches the modal", async () => {
    const messages = structuredClone(projectRankTrackerFeatureTestMessages);
    messages.projectRankTracker.keywordImport.management.runConfirmation.providerAccountRestricted =
      "Dostawca ograniczył dostęp do tego konta.";
    messages.projectRankTracker.keywordImport.management.runConfirmation.providerBilling =
      "Dostawca nie ma wystarczających środków.";
    const rawLegacyDetail = "Access was temporarily paused because of unusual activity.";
    const pollAction = vi.fn().mockResolvedValue([
      {
        error: rawLegacyDetail,
        errorCode: "provider_billing",
        finishedAt: "2026-09-13T16:00:00.000Z",
        position: null,
        rankCheckId: CHECK_ID,
        requestedDepth: 20,
        status: "failed",
      },
    ]);

    renderWithFeatureMessages(
      <SessionSpendProvider>
        <RunChecksModalProbe pollAction={pollAction} />
      </SessionSpendProvider>,
      { locale: "pl", messages },
    );

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Confirm and run" })));
    await act(async () => vi.advanceTimersByTimeAsync(2000));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Dostawca ograniczył dostęp do tego konta.",
    );
    expect(screen.queryByText(rawLegacyDetail)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open integrations" })).toBeInTheDocument();
  });

  it("keeps an ordinary billing terminal failure retryable without rendering provider detail", async () => {
    const messages = structuredClone(projectRankTrackerFeatureTestMessages);
    messages.projectRankTracker.keywordImport.management.runConfirmation.providerBilling =
      "Dostawca nie ma wystarczających środków.";
    const rawProviderDetail = "The billing account needs additional provider funds.";
    const pollAction = vi.fn().mockResolvedValue([
      {
        error: rawProviderDetail,
        errorCode: "provider_billing",
        finishedAt: "2026-09-13T16:00:00.000Z",
        position: null,
        rankCheckId: CHECK_ID,
        requestedDepth: 20,
        status: "failed",
      },
    ]);

    renderWithFeatureMessages(
      <SessionSpendProvider>
        <RunChecksModalProbe pollAction={pollAction} />
      </SessionSpendProvider>,
      { locale: "pl", messages },
    );

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Confirm and run" })));
    await act(async () => vi.advanceTimersByTimeAsync(2000));

    expect(screen.getByRole("alert")).toHaveTextContent("Dostawca nie ma wystarczających środków.");
    expect(screen.queryByText(rawProviderDetail)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open integrations" })).toBeInTheDocument();
  });

  it("keeps unknown terminal provider details out of the localized modal", async () => {
    const messages = structuredClone(projectRankTrackerFeatureTestMessages);
    messages.projectRankTracker.keywordImport.management.runConfirmation.providerUnknown =
      "Wystąpił nieznany błąd dostawcy.";
    const rawProviderDetail = "Account secret: provider-token-should-not-render.";
    const pollAction = vi.fn().mockResolvedValue([
      {
        error: rawProviderDetail,
        errorCode: "provider_future_code",
        finishedAt: "2026-09-13T16:00:00.000Z",
        position: null,
        rankCheckId: CHECK_ID,
        requestedDepth: 20,
        status: "failed",
      },
    ]);

    renderWithFeatureMessages(
      <SessionSpendProvider>
        <RunChecksModalProbe pollAction={pollAction} />
      </SessionSpendProvider>,
      { locale: "pl", messages },
    );

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Confirm and run" })));
    await act(async () => vi.advanceTimersByTimeAsync(2000));

    expect(screen.getByRole("alert")).toHaveTextContent("Wystąpił nieznany błąd dostawcy.");
    expect(screen.queryByText(rawProviderDetail)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open integrations" })).not.toBeInTheDocument();
  });
});
