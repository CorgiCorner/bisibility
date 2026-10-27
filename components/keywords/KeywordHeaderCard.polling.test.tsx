import { routerMock } from "@/tests/next-navigation";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mocks, renderCard, resetHeaderCardMocks } from "./KeywordHeaderCard.test-utils";
import { useRankCheckPoll } from "./use-rank-check-poll";

vi.mock("./use-rank-check-poll", () => ({ useRankCheckPoll: vi.fn() }));

beforeEach(resetHeaderCardMocks);
afterEach(() => vi.unstubAllGlobals());

it.each(["completed", "failed", "deferred"])(
  "keeps the accepted run active after preflight closes and refreshes on %s",
  async (status) => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Run check (Top 100)" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: /^Start run/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const active = vi.mocked(useRankCheckPoll).mock.calls.at(-1)?.[0];
    if (!active) throw new Error("Missing active poll subscription");
    expect(active.rankCheckId).toBe("rcr_abcdefghijklmnopqrstuvwx");
    expect(screen.getByRole("button", { name: "Run check (Top 100)" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Run check (Top 100)" }));
    expect(mocks.launchRankCheckRunAction).toHaveBeenCalledOnce();

    act(() =>
      active.onTerminal({
        error: null,
        errorCode: null,
        finishedAt: "2026-08-21T12:00:00.000Z",
        position: status === "completed" ? 12 : null,
        requestedDepth: 100,
        status,
      }),
    );

    expect(vi.mocked(useRankCheckPoll).mock.calls.at(-1)?.[0].rankCheckId).toBeNull();
    expect(screen.getByRole("button", { name: "Run check (Top 100)" })).toBeEnabled();
    expect(routerMock.refresh).toHaveBeenCalledTimes(2);
  },
);
