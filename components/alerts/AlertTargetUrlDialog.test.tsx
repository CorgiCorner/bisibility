import { renderWithAlertMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { routerMock } from "@/tests/next-navigation";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
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
    expect(
      screen.getByRole("button", {
        name: "The page you expect to rank. Used to highlight when a different URL ranks instead.",
      }),
    ).toBeInTheDocument();

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
  it("keeps submission pending and permits retry after rejection", async () => {
    let reject!: (reason: Error) => void;
    mocks.setTarget
      .mockReturnValueOnce(
        new Promise((_, fail) => {
          reject = fail;
        }),
      )
      .mockResolvedValueOnce({ updated: 1 });
    const onClose = vi.fn();
    render(
      <AlertTargetUrlDialog
        alertId="alert_1"
        keyword="keyword"
        onClose={onClose}
        projectId="prj_1"
        targetUrl={null}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Target URL" }), {
      target: { value: "/page" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save target URL" }));
    await waitFor(() => expect(mocks.setTarget).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /saving/i }));
    expect(mocks.setTarget).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error("Failed")));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save target URL" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(mocks.setTarget).toHaveBeenCalledTimes(2);
  });

  it("serializes two immediate form submissions", async () => {
    let resolve!: (value: { updated: number }) => void;
    mocks.setTarget.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(
      <AlertTargetUrlDialog
        alertId="alert_1"
        keyword="keyword"
        onClose={vi.fn()}
        projectId="prj_1"
        targetUrl="/page"
      />,
    );
    const form = screen.getByRole("textbox", { name: "Target URL" }).closest("form");
    expect(form).not.toBeNull();
    if (!form) throw new Error("Expected a form");
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.setTarget).toHaveBeenCalled());
    expect(mocks.setTarget).toHaveBeenCalledOnce();
    await act(async () => resolve({ updated: 1 }));
  });
});
