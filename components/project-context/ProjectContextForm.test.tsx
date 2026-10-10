import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import type { ProjectContextResource } from "@/lib/project-context/model";
import { emptyProjectContext } from "@/lib/project-context/model";
import messages from "@/messages/core/en/agent-workspace.json";
import shared from "@/messages/core/en/shared.json";
import { deferred } from "@/tests/deferred";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectContextForm } from "./ProjectContextForm";

function render(canEdit = true, saveAction = vi.fn().mockResolvedValue(emptyProjectContext)) {
  renderWithFeatureMessages(
    <ProjectContextForm
      projectId="prj_abcdefghijklmnopqrstuvwx"
      context={emptyProjectContext}
      canEdit={canEdit}
      saveAction={saveAction}
    />,
    { messages: { ...shared, ...messages } },
  );
  return saveAction;
}

describe("ProjectContextForm", () => {
  it("submits scoped context fields without resource metadata", async () => {
    const save = render();
    fireEvent.change(screen.getByLabelText("Business"), { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Save context" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        business: "Acme",
        audience: "",
        products: "",
        goals: "",
        agentRules: "",
        projectId: "prj_abcdefghijklmnopqrstuvwx",
      }),
    );
  });
  it("disables all fields for read-only actors", () => {
    render(false);
    expect(screen.getAllByRole("textbox")).toHaveLength(5);
    for (const field of screen.getAllByRole("textbox")) expect(field).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save context" })).not.toBeInTheDocument();
  });
  it("keeps edits and shows an error when persistence fails", async () => {
    render(true, vi.fn().mockRejectedValue(new Error("storage offline")));
    fireEvent.change(screen.getByLabelText("Business"), { target: { value: "Unsaved business" } });
    fireEvent.click(screen.getByRole("button", { name: "Save context" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
    expect(screen.getByLabelText("Business")).toHaveValue("Unsaved business");
  });
  it("locks pending saves and clears the current error after retry across three cycles", async () => {
    const save = render(true, vi.fn());
    for (let cycle = 1; cycle <= 3; cycle += 1) {
      const pending = deferred<ProjectContextResource>();
      save.mockReturnValueOnce(pending.promise);
      fireEvent.change(screen.getByLabelText("Business"), {
        target: { value: `Context cycle ${cycle}` },
      });
      const button = screen.getByRole("button", { name: "Save context" });
      fireEvent.click(button);
      fireEvent.click(button);
      await waitFor(() => expect(save).toHaveBeenCalledTimes(cycle));
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("aria-busy", "true");
      for (const field of screen.getAllByRole("textbox")) expect(field).toBeDisabled();
      pending.reject(new Error("private fixture storage diagnostic"));
      expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
      expect(screen.getByRole("alert")).not.toHaveTextContent("private fixture");
      expect(screen.getByLabelText("Business")).toHaveValue(`Context cycle ${cycle}`);
      await waitFor(() => expect(button).toBeEnabled());
    }
    save.mockResolvedValueOnce({ ...emptyProjectContext, business: "Context cycle 3" });
    fireEvent.click(screen.getByRole("button", { name: "Save context" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save context" })).toBeDisabled(),
    );
    expect(save).toHaveBeenCalledTimes(4);
    expect(screen.getByLabelText("Business")).toHaveValue("Context cycle 3");
  });
});
