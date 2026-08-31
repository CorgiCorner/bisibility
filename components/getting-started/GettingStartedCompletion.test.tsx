import { appPath } from "@/lib/routing/app-path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GettingStartedCompletion } from "./GettingStartedCompletion";

const projectRef = "prj_abcdefghijklmnopqrstuvwx";

describe("GettingStartedCompletion", () => {
  it("renders state A with exact generic copy and one CTA", () => {
    const { container } = render(
      <GettingStartedCompletion
        acknowledged={false}
        onAcknowledge={vi.fn()}
        projectRef={projectRef}
      />,
    );
    expect(screen.getByText("Setup complete - first positions are in.")).toBeVisible();
    expect(container.querySelector(".size-10")).toBeNull();
    expect(screen.getAllByRole("button", { name: "See the dashboard" })).toHaveLength(1);
    expect(container.textContent).not.toMatch(/keyword|schedule|run|position count/i);
    expect(container.textContent).not.toContain("\u2014");
  });

  it("acknowledges before navigating from state A", async () => {
    const onAcknowledge = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <GettingStartedCompletion
        acknowledged={false}
        onAcknowledge={onAcknowledge}
        projectRef={projectRef}
      />,
    );
    await user.click(screen.getByRole("button", { name: "See the dashboard" }));
    expect(onAcknowledge).toHaveBeenCalledWith({ projectRef });
  });

  it("surfaces acknowledgement failures and refreshes the derived state", async () => {
    const onAcknowledge = vi.fn().mockRejectedValue(new Error("Setup is not complete."));
    const user = userEvent.setup();
    render(
      <GettingStartedCompletion
        acknowledged={false}
        onAcknowledge={onAcknowledge}
        projectRef={projectRef}
      />,
    );

    await user.click(screen.getByRole("button", { name: "See the dashboard" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Setup changed before it could be completed. Review the checklist and try again.",
    );
    await waitFor(() => expect(onAcknowledge).toHaveBeenCalledOnce());
  });

  it("renders state B as a slim bar without a duplicate dashboard link", () => {
    const { container } = render(
      <GettingStartedCompletion acknowledged onAcknowledge={vi.fn()} projectRef={projectRef} />,
    );
    expect(screen.getByText("Setup complete.")).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector(`a[href="${appPath(projectRef, "dashboard")}"]`)).toBeNull();
  });
});
