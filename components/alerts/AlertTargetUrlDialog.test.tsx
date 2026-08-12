import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlertTargetUrlDialog } from "./AlertTargetUrlDialog";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), setTarget: vi.fn() }));

vi.mock("@/lib/actions/alert-feed", () => ({
  setAlertKeywordTargetUrl: mocks.setTarget,
}));

describe("AlertTargetUrlDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires an explicit target URL and then saves it", async () => {
    const onClose = vi.fn();
    mocks.setTarget.mockResolvedValue({ updated: 1 });
    render(
      <AlertTargetUrlDialog
        alertId="alert_1"
        keyword="rank tracker"
        onClose={onClose}
        projectId="prj_1"
        targetUrl={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save target URL" }));
    expect(await screen.findByText("Enter a target URL.")).toBeInTheDocument();
    expect(mocks.setTarget).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: "Target URL" }), {
      target: { value: "/features/rank-tracking" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save target URL" }));

    await waitFor(() =>
      expect(mocks.setTarget).toHaveBeenCalledWith({
        alertId: "alert_1",
        projectId: "prj_1",
        targetUrl: "/features/rank-tracking",
      }),
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(routerMock.refresh).toHaveBeenCalledOnce();
  });
});
