import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import messages from "@/messages/core/en/agent-workspace.json";
import shared from "@/messages/core/en/shared.json";
import { deferred } from "@/tests/deferred";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportComposer } from "./ReportComposer";

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const reportId = "agr_abcdefghijklmnopqrstuvwx";

function render(saveAction = vi.fn().mockResolvedValue({ id: reportId })) {
  renderWithFeatureMessages(<ReportComposer projectId={projectId} saveAction={saveAction} />, {
    messages: { ...shared, ...messages },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save an analysis" }));
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
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Content opportunities" },
    });
    fireEvent.change(screen.getByLabelText("Analysis"), {
      target: { value: "Improve category headings." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save report" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        projectId,
        title: "Content opportunities",
        analysis: "Improve category headings.",
      }),
    );
    expect(routerMock.push).toHaveBeenCalledWith(`/app/${projectId}/agent-reports/${reportId}`);
  });
  it("keeps unsaved content available after a save failure", async () => {
    render(vi.fn().mockRejectedValue(new Error("storage offline")));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Unsaved" } });
    fireEvent.change(screen.getByLabelText("Analysis"), {
      target: { value: "Keep this analysis." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
    expect(screen.getByLabelText("Analysis")).toHaveValue("Keep this analysis.");
    expect(routerMock.push).not.toHaveBeenCalled();
  });
  it("cancels the editor without persisting", () => {
    const save = render();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Analysis")).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
  it("keeps one draft through three keyboard open/close cycles without persistence", async () => {
    const user = userEvent.setup();
    const save = render();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Draft title" } });
    fireEvent.change(screen.getByLabelText("Analysis"), { target: { value: "Draft evidence." } });
    for (let cycle = 0; cycle < 3; cycle += 1) {
      screen.getByRole("button", { name: "Cancel" }).focus();
      await user.keyboard("{Enter}");
      expect(screen.queryByLabelText("Analysis")).not.toBeInTheDocument();
      screen.getByRole("button", { name: "Save an analysis" }).focus();
      await user.keyboard("{Enter}");
      expect(screen.getByLabelText("Title")).toHaveValue("Draft title");
      expect(screen.getByLabelText("Analysis")).toHaveValue("Draft evidence.");
      screen.getByLabelText("Title").focus();
      await user.tab();
      expect(screen.getByLabelText("Analysis")).toHaveFocus();
    }
    expect(save).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
  });
  it("admits one pending save per click pair and recovers from repeated failures", async () => {
    const save = render(vi.fn());
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Retained title" } });
    fireEvent.change(screen.getByLabelText("Analysis"), {
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
      expect(screen.getByLabelText("Analysis")).toHaveValue("Retained evidence.");
      await waitFor(() => expect(button).toBeEnabled());
    }
    save.mockResolvedValueOnce({ id: reportId });
    fireEvent.click(screen.getByRole("button", { name: "Save report" }));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(4);
  });
});
