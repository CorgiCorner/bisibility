import { renderWithGettingStartedMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GettingStartedCompletion } from "./GettingStartedCompletion";

const projectRef = "prj_abcdefghijklmnopqrstuvwx";
const allComplete = "All setup steps complete";
const checklistError = "Complete every setup step before finishing.";
const finish = "Finish setup";
const helper =
  "Confirm the setup when you are ready. Your project keeps its existing data and settings.";
const heading = "What's next";
const writeError = "Could not save setup completion. Try again.";

describe("GettingStartedCompletion", () => {
  it("renders state A with the finish action on the right", () => {
    const { container } = render(
      <GettingStartedCompletion
        acknowledged={false}
        onAcknowledge={vi.fn()}
        projectRef={projectRef}
      />,
    );
    expect(screen.getByText(allComplete)).toBeVisible();
    expect(screen.getByText(heading)).toBeVisible();
    expect(container.querySelector(".size-10")).toBeNull();
    expect(screen.getByRole("button", { name: finish })).toBeVisible();
    expect(screen.getByText(helper)).toBeVisible();
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
    await user.click(screen.getByRole("button", { name: finish }));
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

    await user.click(screen.getByRole("button", { name: finish }));

    expect(await screen.findByRole("alert")).toHaveTextContent(checklistError);
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

    await user.click(screen.getByRole("button", { name: finish }));

    expect(await screen.findByRole("alert")).toHaveTextContent(writeError);
  });

  it("renders state B without a finish action or dashboard link", () => {
    render(
      <GettingStartedCompletion acknowledged onAcknowledge={vi.fn()} projectRef={projectRef} />,
    );
    expect(screen.getByText(allComplete)).toBeVisible();
    expect(screen.getByText(heading)).toBeVisible();
    expect(screen.queryByRole("button", { name: finish })).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
