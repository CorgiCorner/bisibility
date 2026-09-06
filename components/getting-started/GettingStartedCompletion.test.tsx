import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GettingStartedCompletion } from "./GettingStartedCompletion";
import {
  ALL_STEPS_COMPLETE,
  FINISH_SETUP_CTA,
  FINISH_SETUP_HELPER,
  SETUP_ACK_CHECKLIST_ERROR,
  SETUP_ACK_WRITE_ERROR,
  WHATS_NEXT_HEADING,
} from "./getting-started-copy";

const projectRef = "prj_abcdefghijklmnopqrstuvwx";

describe("GettingStartedCompletion", () => {
  it("renders state A with the finish action on the right", () => {
    const { container } = render(
      <GettingStartedCompletion
        acknowledged={false}
        onAcknowledge={vi.fn()}
        projectRef={projectRef}
      />,
    );
    expect(screen.getByText(ALL_STEPS_COMPLETE)).toBeVisible();
    expect(screen.getByText(WHATS_NEXT_HEADING)).toBeVisible();
    expect(container.querySelector(".size-10")).toBeNull();
    expect(screen.getByRole("button", { name: FINISH_SETUP_CTA })).toBeVisible();
    expect(screen.getByText(FINISH_SETUP_HELPER)).toBeVisible();
    expect(container.querySelector(".sm\\:flex-row.sm\\:justify-between")).not.toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
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

  it("renders state B without a finish action or dashboard link", () => {
    render(
      <GettingStartedCompletion acknowledged onAcknowledge={vi.fn()} projectRef={projectRef} />,
    );
    expect(screen.getByText(ALL_STEPS_COMPLETE)).toBeVisible();
    expect(screen.getByText(WHATS_NEXT_HEADING)).toBeVisible();
    expect(screen.queryByRole("button", { name: FINISH_SETUP_CTA })).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
