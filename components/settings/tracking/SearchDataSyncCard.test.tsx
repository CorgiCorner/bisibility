import { SearchDataSyncCard } from "@/components/settings/tracking/SearchDataSyncCard";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("@/components/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui")>();
  return { ...actual, useToast: () => ({ showToast: mocks.showToast }) };
});

const metrics = {
  connectionStatus: "connected" as const,
  lastQuotaPausedAt: null,
  lastActivityAt: null,
  pausedReason: null,
  safeError: null,
  state: "running",
  pauseStartedAt: null,
  plannedRemaining: 1200,
  requestsToday: 28,
};

describe("SearchDataSyncCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a truthful connect action when Search Console is disconnected", () => {
    render(
      <SearchDataSyncCard
        canEdit
        metrics={{ ...metrics, connectionStatus: "not_connected", state: null }}
        pace="normal"
        projectId="prj_1"
        retentionMonths={16}
        updateSettings={vi.fn()}
      />,
    );

    expect(screen.getByText("Search Console not connected")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect Search Console" })).toHaveAttribute(
      "href",
      expect.stringContaining("provider=gsc"),
    );
    expect(screen.queryByText(/Sync active/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/waiting for first request/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Pause Search Console sync/i }),
    ).not.toBeInTheDocument();
  });

  it("shows running sync only for a connected property", () => {
    render(
      <SearchDataSyncCard
        canEdit
        metrics={metrics}
        pace="normal"
        projectId="prj_1"
        retentionMonths={16}
        updateSettings={vi.fn()}
      />,
    );

    expect(screen.getByText("Backfill in progress")).toBeInTheDocument();
    expect(screen.getByText("Finalized days are being imported now.")).toBeInTheDocument();
    expect(screen.queryByText("Sync active · waiting for first request")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause Search Console sync" })).toHaveTextContent(
      "Pause",
    );
  });

  it("shows resume without active-sync copy when a connected import is paused", () => {
    render(
      <SearchDataSyncCard
        canEdit
        metrics={{ ...metrics, pausedReason: "user", state: "paused" }}
        pace="normal"
        projectId="prj_1"
        retentionMonths={16}
        updateSettings={vi.fn()}
      />,
    );

    expect(screen.getByText("Backfill paused")).toBeInTheDocument();
    expect(
      screen.getByText("New finalized days will not be imported until you resume sync."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Paused by you")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume Search Console sync" })).toHaveTextContent(
      "Resume sync",
    );
    expect(
      screen.queryByRole("button", { name: "Resume sync Search Console sync" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Sync active/i)).not.toBeInTheDocument();
  });
  it("shows settings, live metrics, and shared quota rationale", () => {
    render(
      <SearchDataSyncCard
        canEdit
        metrics={metrics}
        pace="normal"
        projectId="prj_1"
        retentionMonths={16}
        updateSettings={vi.fn()}
      />,
    );
    expect(screen.getByText("Search data sync")).toBeInTheDocument();
    const importDepth = screen.getByRole("button", { name: "Import depth" });
    const importSpeed = screen.getByRole("button", { name: "Import speed" });
    const settingsFieldset = importDepth.closest("fieldset");
    const form = settingsFieldset?.closest("form");
    const formContent = form?.parentElement;
    const card = formContent?.closest("[data-settings-card]");
    expect(card).toHaveClass("p-5");
    expect(formContent).toHaveClass("mt-3");
    expect(formContent).not.toHaveClass("mt-5");
    expect(form).toHaveClass("-mx-5");
    expect(settingsFieldset).toHaveClass("grid", "grid-cols-1", "gap-4", "px-4");
    expect(settingsFieldset).not.toHaveClass("p-5", "px-5", "sm:grid-cols-2");
    expect(importDepth.closest("[data-settings-field-width]")).not.toHaveClass("max-w-[340px]");
    expect(importSpeed.closest("[data-settings-field-width]")).not.toHaveClass("max-w-[340px]");
    expect(importDepth).toHaveClass("mt-1.5", "w-full");
    expect(importSpeed).toHaveClass("mt-1.5", "w-full");
    expect(screen.getByText("Uses the normal provider request rate.")).toBeInTheDocument();
    expect(screen.queryByText("Sync pace")).not.toBeInTheDocument();
    expect(screen.queryByText("Normal")).not.toBeInTheDocument();
    expect(screen.queryByText("Gentle")).not.toBeInTheDocument();
    expect(screen.getByText("requests today: 28")).toBeInTheDocument();
    expect(screen.getByText("planned remaining: 1,200")).toBeInTheDocument();
    expect(screen.getByText("last quota pause: never")).toBeInTheDocument();
    expect(screen.getByText(/shared with other tools/i)).toBeInTheDocument();
  });

  it("pauses independently from saving depth and pace", async () => {
    const pauseAction = vi.fn(async () => ({ ok: true as const, state: "paused" }));
    const updateSettings = vi.fn(async () => ({}));
    render(
      <SearchDataSyncCard
        canEdit
        metrics={metrics}
        pace="normal"
        projectId="prj_1"
        retentionMonths={16}
        pauseAction={pauseAction}
        updateSettings={updateSettings}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pause Search Console sync" }));
    await waitFor(() =>
      expect(pauseAction).toHaveBeenCalledWith({ projectId: "prj_1", transition: "pause" }),
    );
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("toasts only the sanitized transition failure without inline error copy", async () => {
    const message = "Search data sync could not be paused. Refresh the page and try again.";
    const pauseAction = vi.fn(async () => ({ message, ok: false as const }));
    render(
      <SearchDataSyncCard
        canEdit
        metrics={metrics}
        pace="normal"
        projectId="prj_1"
        retentionMonths={16}
        pauseAction={pauseAction}
        updateSettings={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pause Search Console sync" }));
    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith(message, { severity: "error" }),
    );
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it("saves depth and pace through the project action", async () => {
    const updateSettings = vi.fn(async () => ({}));
    render(
      <SearchDataSyncCard
        canEdit
        metrics={metrics}
        pace="normal"
        projectId="prj_1"
        retentionMonths={16}
        updateSettings={updateSettings}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Import depth" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "6 months" }));
    fireEvent.click(screen.getByRole("button", { name: "Import speed" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Reduced" }));
    expect(screen.getByText("Uses fewer provider requests and takes longer.")).toBeInTheDocument();
    expect(screen.queryByText("Gentle")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({
        projectId: "prj_1",
        retentionMonths: 6,
        pace: "gentle",
      }),
    );
  });
});
