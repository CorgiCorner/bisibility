import { appPath } from "@/lib/routing/app-path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GettingStartedCompletion } from "./GettingStartedCompletion";
import {
  FINISH_SETUP_CTA,
  SEE_DASHBOARD_CTA,
  SETUP_ACK_CHECKLIST_ERROR,
  SETUP_ACK_WRITE_ERROR,
  SETUP_FINISHED_HEADLINE,
} from "./getting-started-copy";

const projectRef = "prj_abcdefghijklmnopqrstuvwx";

describe("GettingStartedCompletion", () => {
  it("renders state A with finish and dashboard actions", () => {
    const { container } = render(
      <GettingStartedCompletion
        acknowledged={false}
        onAcknowledge={vi.fn()}
        projectRef={projectRef}
      />,
    );
    expect(screen.getByText("Setup complete - first positions are in.")).toBeVisible();
    expect(container.querySelector(".size-10")).toBeNull();
    expect(screen.getByRole("button", { name: FINISH_SETUP_CTA })).toBeVisible();
    expect(screen.getByRole("link", { name: SEE_DASHBOARD_CTA })).toHaveAttribute(
      "href",
      appPath(projectRef, "dashboard"),
    );
    expect(container.textContent).not.toMatch(/keyword|schedule|run|position count/i);
    expect(container.textContent).not.toContain("\u2014");
  });

  it("acknowledges without navigating when finish setup is clicked", async () => {
    const onAcknowledge = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(
      <GettingStartedCompletion
        acknowledged={false}
        onAcknowledge={onAcknowledge}
        projectRef={projectRef}
      />,
    );
    await user.click(screen.getByRole("button", { name: FINISH_SETUP_CTA }));
    expect(onAcknowledge).toHaveBeenCalledWith({ projectRef });
  });

  it("does not acknowledge when see the dashboard is clicked", async () => {
    const onAcknowledge = vi.fn();
    const user = userEvent.setup();
    render(
      <GettingStartedCompletion
        acknowledged={false}
        onAcknowledge={onAcknowledge}
        projectRef={projectRef}
      />,
    );
    await user.click(screen.getByRole("link", { name: SEE_DASHBOARD_CTA }));
    expect(onAcknowledge).not.toHaveBeenCalled();
  });

  it("surfaces checklist failures separately from write failures", async () => {
    const onAcknowledge = vi.fn().mockResolvedValue({ ok: false, reason: "incomplete" });
    const user = userEvent.setup();
    render(
      <GettingStartedCompletion
        acknowledged={false}
        onAcknowledge={onAcknowledge}
        projectRef={projectRef}
      />,
    );

    await user.click(screen.getByRole("button", { name: FINISH_SETUP_CTA }));

    expect(await screen.findByRole("alert")).toHaveTextContent(SETUP_ACK_CHECKLIST_ERROR);
    await waitFor(() => expect(onAcknowledge).toHaveBeenCalledOnce());
  });

  it("names write failures when acknowledgement cannot be saved", async () => {
    const onAcknowledge = vi.fn().mockResolvedValue({ ok: false, reason: "write_failed" });
    const user = userEvent.setup();
    render(
      <GettingStartedCompletion
        acknowledged={false}
        onAcknowledge={onAcknowledge}
        projectRef={projectRef}
      />,
    );

    await user.click(screen.getByRole("button", { name: FINISH_SETUP_CTA }));

    expect(await screen.findByRole("alert")).toHaveTextContent(SETUP_ACK_WRITE_ERROR);
  });

  it("renders state B with setup finished and a dashboard link", () => {
    const { container } = render(
      <GettingStartedCompletion acknowledged onAcknowledge={vi.fn()} projectRef={projectRef} />,
    );
    expect(screen.getByText(SETUP_FINISHED_HEADLINE)).toBeVisible();
    expect(screen.queryByRole("button", { name: FINISH_SETUP_CTA })).toBeNull();
    expect(screen.getByRole("link", { name: SEE_DASHBOARD_CTA })).toHaveAttribute(
      "href",
      appPath(projectRef, "dashboard"),
    );
    expect(
      container.querySelectorAll(`a[href="${appPath(projectRef, "dashboard")}"]`),
    ).toHaveLength(1);
  });
});
