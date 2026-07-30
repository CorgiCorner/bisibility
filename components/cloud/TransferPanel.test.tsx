import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TransferPanel } from "./TransferPanel";

describe("TransferPanel", () => {
  it("separates created and skipped rows in an idempotent re-import summary", () => {
    render(
      <TransferPanel
        job={{
          counts: {
            history: 0,
            history_received: 20,
            history_skipped: 20,
            keywords: 6,
            keywords_created: 0,
            keywords_skipped: 6,
          },
          createdAt: "2026-07-20T12:00:00.000Z",
          error: null,
          finishedAt: "2026-07-20T12:01:00.000Z",
          id: "imp_abcdefghijklmnopqrstuvwx",
          progress: 100,
          startedAt: "2026-07-20T12:00:00.000Z",
          state: "done",
        }}
        onNewToken={vi.fn()}
        projectRef="prj_abcdefghijklmnopqrstuvwx"
      />,
    );

    const description = screen.getByText(/Imported 0 new keywords/i);
    expect(description).toHaveTextContent("6 keywords, 20 history rows skipped");
    expect(description).not.toHaveTextContent("Imported 0 history, 6 keywords");
  });
});
