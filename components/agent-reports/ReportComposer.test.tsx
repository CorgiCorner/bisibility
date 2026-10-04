import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import messages from "@/messages/core/en/agent-workspace.json";
import shared from "@/messages/core/en/shared.json";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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
});
