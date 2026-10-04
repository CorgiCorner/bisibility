import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { ProviderTrafficSyncResult } from "@/lib/integrations/types";
import { routerMock } from "@/tests/next-navigation";
import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeywordTrafficSync } from "./KeywordTrafficSync";

const projectRef = "prj_abcdefghijklmnopqrstuvwx";
const success: ProviderTrafficSyncResult = {
  connections: 1,
  keywordSnapshots: 0,
  pageSnapshots: 1,
  runs: [{ status: "succeeded_with_data" }],
};
beforeEach(() => vi.clearAllMocks());

describe("keyword analytics fetch", () => {
  it("calls the project sync once, shows progress and refreshes stored data after completion", async () => {
    let complete!: (result: ProviderTrafficSyncResult) => void;
    const syncAction = vi.fn(
      () =>
        new Promise<ProviderTrafficSyncResult>((resolve) => {
          complete = resolve;
        }),
    );
    render(
      <KeywordTrafficSync canSync connected projectRef={projectRef} syncAction={syncAction} />,
    );
    const button = screen.getByRole("button", { name: "Fetch analytics" });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(syncAction).toHaveBeenCalledExactlyOnceWith({ projectId: projectRef });
    expect(screen.getByRole("button", { name: "Fetching analytics…" })).toBeDisabled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
    await act(async () => complete(success));
    expect(routerMock.refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("Analytics refreshed.");
    expect(screen.getByRole("button", { name: "Fetch analytics" })).toBeEnabled();
  });

  it.each([
    [[], "No connected source", "alert"],
    [["failed"], "Analytics could not be fetched", "alert"],
    [["skipped_needs_reauth"], "needs to be reconnected", "alert"],
    [["deferred_rate_limit"], "request limit was reached", "alert"],
    [["not_applicable"], "No connected source", "alert"],
    [["succeeded_empty"], "No matching query or page data", "status"],
    [["succeeded_with_data", "failed"], "Some sources refreshed", "alert"],
  ] as const)("reports %j without claiming full success", async (statuses, message, role) => {
    const syncAction = vi.fn(async () => ({
      ...success,
      keywordSnapshots: 0,
      pageSnapshots: 0,
      runs: statuses.map((status) => ({ status })),
    }));
    render(
      <KeywordTrafficSync canSync connected projectRef={projectRef} syncAction={syncAction} />,
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Fetch analytics" })));
    expect(screen.getByRole(role)).toHaveTextContent(message);
    expect(routerMock.refresh).toHaveBeenCalledOnce();
    if (role === "alert")
      expect(screen.getByRole("link", { name: "Manage integrations" })).toHaveAttribute(
        "href",
        `/app/${projectRef}/integrations`,
      );
  });

  it("allows retry after a rejected request without exposing server details", async () => {
    const syncAction = vi
      .fn()
      .mockRejectedValueOnce(new Error("internal provider detail"))
      .mockResolvedValue(success);
    render(
      <KeywordTrafficSync canSync connected projectRef={projectRef} syncAction={syncAction} />,
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Fetch analytics" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Analytics could not be fetched");
    expect(screen.queryByText(/internal provider detail/)).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Fetch analytics" })));
    expect(screen.getByRole("status")).toHaveTextContent("Analytics refreshed.");
    expect(routerMock.refresh).toHaveBeenCalledOnce();
  });

  it.each([
    { canSync: false, connected: true },
    { canSync: true, connected: false },
  ])("offers no provider action for %j", (props) => {
    const syncAction = vi.fn();
    render(<KeywordTrafficSync {...props} projectRef={projectRef} syncAction={syncAction} />);
    expect(screen.queryByRole("button", { name: "Fetch analytics" })).toBeNull();
    expect(syncAction).not.toHaveBeenCalled();
  });

  it("respects a project migration write hold", () => {
    const syncAction = vi.fn();
    render(
      <ProjectWriteModeProvider projectRef={projectRef} writeMode="migration_hold">
        <KeywordTrafficSync canSync connected projectRef={projectRef} syncAction={syncAction} />
      </ProjectWriteModeProvider>,
    );
    const button = screen.getByRole("button", { name: "Fetch analytics" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(syncAction).not.toHaveBeenCalled();
  });
});
