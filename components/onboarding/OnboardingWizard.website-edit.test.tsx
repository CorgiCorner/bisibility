import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { project, renderWizard } from "./OnboardingWizard.test-utils";

it("preserves the corrected project through 1 > 2 > 1 and another visit to step 1", async () => {
  const saved = { ...project, domain: "tes.co", name: "tes" };
  const updateProjectAction = vi.fn(async () => ({
    ok: true as const,
    changed: true,
    project: saved,
  }));
  const createProjectAction = vi.fn(async () => project);
  renderWizard({ actions: { createProjectAction, updateProjectAction } });
  fireEvent.change(screen.getByLabelText("Your website"), { target: { value: "example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("button", { name: "Back" });
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  fireEvent.change(screen.getByLabelText("Your website"), { target: { value: "tes.co" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() =>
    expect(updateProjectAction).toHaveBeenCalledWith({
      projectId: project.publicId,
      website: "tes.co",
    }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Back" }));
  expect(screen.getByLabelText("Your website")).toHaveValue("tes.co");
  expect(screen.getByText("tes", { exact: true })).toBeInTheDocument();
  expect(createProjectAction).toHaveBeenCalledTimes(1);
});
