import { ChallengeReportDialog } from "@/components/challenge-report/ChallengeReportDialog";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import messages from "@/messages/core/en/agent-workspace.json";
import challenge from "@/messages/core/en/challenge-report.json";
import shared from "@/messages/core/en/shared.json";
import { deferred } from "@/tests/deferred";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const reportId = "agr_abcdefghijklmnopqrstuvwx";

function render(saveAction = vi.fn().mockResolvedValue({ id: reportId })) {
  renderWithFeatureMessages(
    <ChallengeReportDialog
      createAction={vi.fn()}
      defaultStart="2026-01-01"
      domain="example.com"
      projectId={projectId}
      saveAction={saveAction}
      today="2026-01-30"
    />,
    {
      messages: { ...shared, ...messages, ...challenge },
    },
  );
  fireEvent.click(screen.getByRole("button", { name: "New report" }));
  fireEvent.click(screen.getByRole("button", { name: /^Write or paste a report/ }));
  return saveAction;
}

describe("manual report composer", () => {
  beforeEach(() => vi.clearAllMocks());
  it("validates empty fields before invoking persistence", async () => {
    const save = render();
    fireEvent.click(screen.getByRole("button", { name: "Save report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a title");
    expect(save).not.toHaveBeenCalled();
  });
  it("saves scoped analyst text and navigates to the protected report", async () => {
    const save = render();
    fireEvent.change(screen.getByLabelText("Report title"), {
      target: { value: "Content opportunities" },
    });
    fireEvent.change(screen.getByLabelText("Report content"), {
      target: { value: "Improve category headings." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save report" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        projectId,
        requestId: expect.any(String),
        title: "Content opportunities",
        analysis: "Improve category headings.",
      }),
    );
    expect(routerMock.push).toHaveBeenCalledWith(`/app/${projectId}/agent-reports/${reportId}`);
  });
  it("keeps unsaved content available after a save failure", async () => {
    render(vi.fn().mockRejectedValue(new Error("storage offline")));
    fireEvent.change(screen.getByLabelText("Report title"), { target: { value: "Unsaved" } });
    fireEvent.change(screen.getByLabelText("Report content"), {
      target: { value: "Keep this analysis." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
    expect(screen.getByLabelText("Report content")).toHaveValue("Keep this analysis.");
    expect(routerMock.push).not.toHaveBeenCalled();
  });
  it("cancels the editor without persisting", () => {
    const save = render();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Report content")).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
  it("keeps one draft through three keyboard open/close cycles without persistence", async () => {
    const user = userEvent.setup();
    const save = render();
    fireEvent.change(screen.getByLabelText("Report title"), { target: { value: "Draft title" } });
    fireEvent.change(screen.getByLabelText("Report content"), {
      target: { value: "Draft evidence." },
    });
    for (let cycle = 0; cycle < 3; cycle += 1) {
      screen.getByRole("button", { name: "Cancel" }).focus();
      await user.keyboard("{Enter}");
      expect(screen.queryByLabelText("Report content")).not.toBeInTheDocument();
      screen.getByRole("button", { name: "New report" }).focus();
      await user.keyboard("{Enter}");
      await user.click(screen.getByRole("button", { name: /^Write or paste a report/ }));
      expect(screen.getByLabelText("Report title")).toHaveValue("Draft title");
      expect(screen.getByLabelText("Report content")).toHaveValue("Draft evidence.");
      screen.getByLabelText("Report title").focus();
      await user.tab();
      expect(screen.getByLabelText("Report content")).toHaveFocus();
    }
    expect(save).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
  });
  it("admits one pending save per click pair and recovers from repeated failures", async () => {
    const save = render(vi.fn());
    fireEvent.change(screen.getByLabelText("Report title"), {
      target: { value: "Retained title" },
    });
    fireEvent.change(screen.getByLabelText("Report content"), {
      target: { value: "Retained evidence." },
    });
    for (let cycle = 1; cycle <= 3; cycle += 1) {
      const pending = deferred<{ id: string }>();
      save.mockReturnValueOnce(pending.promise);
      const button = screen.getByRole("button", { name: "Save report" });
      fireEvent.click(button);
      fireEvent.click(button);
      await waitFor(() => expect(save).toHaveBeenCalledTimes(cycle));
      expect(button).toHaveAttribute("aria-busy", "true");
      expect(button).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
      for (const field of screen.getAllByRole("textbox")) expect(field).toBeDisabled();
      pending.reject(new Error("private fixture persistence diagnostic"));
      expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
      expect(screen.getByRole("alert")).not.toHaveTextContent("private fixture");
      expect(screen.getByLabelText("Report content")).toHaveValue("Retained evidence.");
      await waitFor(() => expect(button).toBeEnabled());
    }
    save.mockResolvedValueOnce({ id: reportId });
    fireEvent.click(screen.getByRole("button", { name: "Save report" }));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(4);
  });
});
