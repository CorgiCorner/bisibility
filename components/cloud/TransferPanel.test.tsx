import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CloudImportJobData } from "./cloud-token";
import { TransferPanel } from "./TransferPanel";

const projectRef = "prj_abcdefghijklmnopqrstuvwx";

function job(state: CloudImportJobData["state"], overrides: Partial<CloudImportJobData> = {}) {
  return {
    counts: null,
    createdAt: "2026-07-20T12:00:00.000Z",
    error: null,
    finishedAt: null,
    id: "imp_abcdefghijklmnopqrstuvwx",
    progress: 0,
    startedAt: null,
    state,
    ...overrides,
  } satisfies CloudImportJobData;
}

function renderPanel(
  state: CloudImportJobData["state"],
  overrides: { hasToken?: boolean; job?: Partial<CloudImportJobData> } = {},
) {
  render(
    <TransferPanel
      hasToken={overrides.hasToken}
      job={job(state, overrides.job)}
      onNewToken={vi.fn()}
      projectRef={projectRef}
    />,
  );
}

describe("TransferPanel", () => {
  it("hides idle status until a token exists", () => {
    const { container } = render(
      <TransferPanel
        hasToken={false}
        job={job("idle")}
        onNewToken={vi.fn()}
        projectRef={projectRef}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows ready to receive after a token is created", () => {
    renderPanel("idle", { hasToken: true });

    expect(screen.getByText("Ready to receive")).toBeVisible();
    expect(screen.getByText("Ready")).toBeVisible();
    expect(
      screen.getByText("Share the one-time token with the source instance to start the transfer."),
    ).toBeVisible();
  });

  it("labels in-flight transfer states without idle copy", () => {
    const { rerender } = render(
      <TransferPanel
        job={job("receiving", { progress: 20 })}
        onNewToken={vi.fn()}
        projectRef={projectRef}
      />,
    );
    expect(screen.getByText("Receiving package")).toBeVisible();

    rerender(
      <TransferPanel
        job={job("importing", { progress: 55 })}
        onNewToken={vi.fn()}
        projectRef={projectRef}
      />,
    );
    expect(screen.getByText("Transfer in progress")).toBeVisible();
    expect(screen.getByText("Transferring")).toBeVisible();
  });

  it("keeps a clean import on the complete state", () => {
    renderPanel("done", {
      job: {
        counts: { history: 4, keywords_created: 3 },
        finishedAt: "2026-07-20T12:01:00.000Z",
        progress: 100,
      },
    });

    expect(screen.getByText("Transfer complete")).toBeVisible();
    expect(screen.queryByText("Restored with notes")).not.toBeInTheDocument();
  });

  it("explains when received history has unknown depth for Visibility", () => {
    renderPanel("done", {
      job: {
        counts: { history: 4, history_unknown_depth: 1, keywords_created: 3 },
        finishedAt: "2026-07-20T12:01:00.000Z",
        progress: 100,
      },
    });

    expect(screen.getByText("Restored with notes")).toBeVisible();
    expect(
      screen.getByText(
        /1 received history row has an unknown depth\. Checks with unknown depth do not update Visibility\. Affected keywords still count toward its coverage total\./,
      ),
    ).toBeVisible();
  });

  it("separates created and skipped rows in an idempotent re-import summary", () => {
    renderPanel("done", {
      job: {
        counts: {
          history: 0,
          history_received: 20,
          history_skipped: 20,
          keywords: 6,
          keywords_created: 0,
          keywords_skipped: 6,
        },
        finishedAt: "2026-07-20T12:01:00.000Z",
        progress: 100,
        startedAt: "2026-07-20T12:00:00.000Z",
      },
    });

    expect(screen.queryByText("Transfer complete")).not.toBeInTheDocument();
    expect(screen.getByText("Restored with notes")).toBeVisible();
    expect(screen.getByText("Notes")).toBeVisible();
    const description = screen.getByText(/Imported 0 new keywords/i);
    expect(description).toHaveTextContent("6 keywords, 20 history rows skipped");
    expect(description).not.toHaveTextContent("Imported 0 history, 6 keywords");
  });

  it("shows transfer failure without claiming the project is unchanged", () => {
    renderPanel("failed", { job: { error: null, progress: 70 } });

    expect(screen.getByText("Transfer failed")).toBeVisible();
    expect(screen.getByText(/Transfer stopped at 70%/)).toBeVisible();
    expect(screen.getByText(/Anything already imported stays in this project/)).toBeVisible();
    expect(screen.queryByText(/this project is unchanged/)).not.toBeInTheDocument();
  });

  it("shows transfer failure with a next step", () => {
    renderPanel("failed", { job: { error: "Package rejected.", progress: 40 } });

    expect(screen.getByText("Transfer failed")).toBeVisible();
    expect(screen.getByText("Package rejected.")).toBeVisible();
    expect(screen.getByText(/Anything already imported stays in this project/)).toBeVisible();
    expect(screen.getByRole("button", { name: "New token" })).toBeVisible();
  });
});
