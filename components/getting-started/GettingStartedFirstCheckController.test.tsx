import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { SetupContext, SetupCta } from "@/lib/getting-started/setup-steps";
import { routerMock } from "@/tests/next-navigation";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GettingStartedFirstCheckController } from "./GettingStartedFirstCheckController";

const CHECK_ID = "check_abcdefghijklmnopqrstuvwx" as const;
const PROJECT_REF = "prj_abcdefghijklmnopqrstuvwx" as const;
const KEYWORD_IDS = ["kw_abcdefghijklmnopqrstuvwx", "kw_bcdefghijklmnopqrstuvwxy"] as const;

vi.mock("@/components/getting-started/GettingStartedChecklist", () => ({
  GettingStartedChecklist: ({
    context,
    onCta,
  }: {
    context: SetupContext;
    onCta: (cta: SetupCta) => void;
  }) => (
    <div>
      <button
        onClick={() => onCta({ id: "run_first_check", label: "Run first check" })}
        type="button"
      >
        Run first check
      </button>
      <button
        onClick={() => onCta({ id: "run_first_check", label: "Run it now instead" })}
        type="button"
      >
        Run it now instead
      </button>
      <output aria-label="checklist progress">
        {context.inFlightBatch
          ? `${context.inFlightBatch.completed} of ${context.inFlightBatch.total}`
          : "idle"}
      </output>
    </div>
  ),
}));

const statusMocks = vi.hoisted(() => ({ getRankCheckStatuses: vi.fn() }));
vi.mock("@/lib/actions/rank-check-status", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/actions/rank-check-status")>()),
  getRankCheckStatuses: statusMocks.getRankCheckStatuses,
}));

function context(inFlightBatch: SetupContext["inFlightBatch"] = null): SetupContext {
  return {
    completedCheckCount: 0,
    inFlightBatch,
    keywordCount: 2,
    keywordIds: [...KEYWORD_IDS],
    project: { exists: true, name: "Example", publicRef: PROJECT_REF },
    providerExists: true,
    schedule: { mode: "manual" },
  };
}

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <SessionSpendProvider>{children}</SessionSpendProvider>;
}

function setup(overrides: Partial<ComponentProps<typeof GettingStartedFirstCheckController>> = {}) {
  const runCheckNowAction = vi.fn().mockResolvedValue({ ok: true, status: "completed" });
  const rows = keywordRows.slice(0, 2).map((row, index) => ({ ...row, id: KEYWORD_IDS[index] }));
  render(
    <GettingStartedFirstCheckController
      context={context()}
      now={new Date("2026-08-30T17:00:00.000Z")}
      providerRate={{ overrideCents: 1, providerId: null }}
      rows={rows as never}
      runCheckNowAction={runCheckNowAction}
      {...overrides}
    />,
    { wrapper },
  );
  return { runCheckNowAction, user: userEvent.setup({ advanceTimers: vi.advanceTimersByTime }) };
}

describe("GettingStartedFirstCheckController", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    statusMocks.getRankCheckStatuses.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it.each(["Run first check", "Run it now instead"])(
    "opens the existing confirmation modal from %s without firing a run",
    async (label) => {
      const { runCheckNowAction, user } = setup();
      await user.click(screen.getByRole("button", { name: label }));
      expect(screen.getByRole("dialog", { name: "Run rank checks" })).toBeVisible();
      expect(screen.getByText("2 keywords")).toBeVisible();
      expect(screen.getByText("~$0.02")).toBeVisible();
      expect(runCheckNowAction).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    },
  );

  it("runs only after modal confirmation", async () => {
    const { runCheckNowAction, user } = setup();
    await user.click(screen.getByRole("button", { name: "Run first check" }));
    await user.click(screen.getByRole("button", { name: "Confirm and run" }));
    await waitFor(() => expect(runCheckNowAction).toHaveBeenCalledTimes(2));
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it("updates persisted running progress through the shared rank-check batch poll hook", async () => {
    statusMocks.getRankCheckStatuses.mockResolvedValue([
      {
        error: null,
        errorCode: null,
        finishedAt: "2026-08-30T17:01:00.000Z",
        position: 3,
        rankCheckId: CHECK_ID,
        requestedDepth: 20,
        status: "completed",
      },
    ]);
    setup({ context: context({ completed: 1, rankCheckIds: [CHECK_ID], total: 2 }) });
    expect(screen.getByLabelText("checklist progress")).toHaveTextContent("1 of 2");
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(statusMocks.getRankCheckStatuses).toHaveBeenCalledWith({
      projectId: PROJECT_REF,
      rankCheckIds: [CHECK_ID],
    });
    expect(screen.getByLabelText("checklist progress")).toHaveTextContent("2 of 2");
  });
  it("adopts a batch that appears after the controller mounts", async () => {
    statusMocks.getRankCheckStatuses.mockResolvedValue([]);
    const rows = keywordRows.slice(0, 2).map((row, index) => ({ ...row, id: KEYWORD_IDS[index] }));
    const props = {
      context: context(),
      now: new Date("2026-08-30T17:00:00.000Z"),
      providerRate: { overrideCents: 1, providerId: null },
      rows: rows as never,
      runCheckNowAction: vi.fn().mockResolvedValue({ ok: true, status: "completed" }),
    };
    const view = render(<GettingStartedFirstCheckController {...props} />, { wrapper });
    expect(screen.getByLabelText("checklist progress")).toHaveTextContent("idle");

    view.rerender(
      <GettingStartedFirstCheckController
        {...props}
        context={context({ completed: 1, rankCheckIds: [CHECK_ID], total: 2 })}
      />,
    );

    expect(screen.getByLabelText("checklist progress")).toHaveTextContent("1 of 2");
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(statusMocks.getRankCheckStatuses).toHaveBeenCalledWith({
      projectId: PROJECT_REF,
      rankCheckIds: [CHECK_ID],
    });
  });
});
