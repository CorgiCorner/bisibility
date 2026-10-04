import { getRankCheckStatus } from "@/lib/actions/rank-check-status";
import { routerMock } from "@/tests/next-navigation";
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderCard, resetHeaderCardMocks } from "./KeywordHeaderCard.test-utils";

vi.mock("@/lib/actions/rank-check-status", () => ({ getRankCheckStatus: vi.fn() }));

const running = {
  error: null,
  errorCode: null,
  finishedAt: null,
  position: null,
  requestedDepth: null,
  status: "running",
};

describe("keyword data after starting a run", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetHeaderCardMocks();
    vi.mocked(getRankCheckStatus).mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each(["completed", "failed", "deferred"])(
    "updates stored results after %s even when no realtime event arrives",
    async (status) => {
      vi.mocked(getRankCheckStatus)
        .mockRejectedValueOnce(new Error("Temporary disconnect"))
        .mockResolvedValueOnce(running)
        .mockResolvedValue({ ...running, status, finishedAt: "2026-09-27T12:00:00.000Z" });
      renderCard();
      await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Run check (Top 100)" })),
      );
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Start run" })));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(routerMock.refresh).toHaveBeenCalledOnce();
      await act(async () => vi.advanceTimersByTimeAsync(2_000));
      expect(getRankCheckStatus).toHaveBeenCalledWith({
        rankCheckId: "rcr_abcdefghijklmnopqrstuvwx",
      });
      await act(async () => vi.advanceTimersByTimeAsync(5_000));
      expect(routerMock.refresh).toHaveBeenCalledOnce();
      await act(async () => vi.advanceTimersByTimeAsync(5_000));
      expect(routerMock.refresh).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("button", { name: "Run check (Top 100)" })).toBeEnabled();
      await act(async () => vi.advanceTimersByTimeAsync(10_000));
      expect(getRankCheckStatus).toHaveBeenCalledTimes(3);
    },
  );
});
