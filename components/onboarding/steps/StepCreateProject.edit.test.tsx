import { onboardingFormId } from "@/components/onboarding/onboarding-form-utils";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StepCreateProject } from "./StepCreateProject";

const project = { domain: "example.com", id: "internal", publicId: "prj_1", name: "example" };
function step(props: Partial<Parameters<typeof StepCreateProject>[0]> = {}) {
  render(
    <>
      <StepCreateProject initialProject={project} {...props} />
      <button form={onboardingFormId} type="submit">
        Continue
      </button>
    </>,
  );
}
describe("correcting an onboarding website", () => {
  it("awaits the saved identity and advances with its canonical website", async () => {
    const nextProject = { ...project, domain: "tes.co", name: "tes" };
    const updateProjectAction = vi.fn(async () => ({
      ok: true as const,
      changed: true,
      project: nextProject,
    }));
    const onComplete = vi.fn();
    step({ updateProjectAction, onComplete });
    fireEvent.change(screen.getByLabelText("Your website"), {
      target: { value: "https://www.tes.co/path" },
    });
    fireEvent.click(screen.getByText("Continue"));
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith({ website: "tes.co" }, nextProject),
    );
    expect(updateProjectAction).toHaveBeenCalledWith({
      projectId: "prj_1",
      website: "https://www.tes.co/path",
    });
  });
  it("keeps the unchanged project without a write", async () => {
    const updateProjectAction = vi.fn();
    const onComplete = vi.fn();
    step({ updateProjectAction, onComplete });
    fireEvent.click(screen.getByText("Continue"));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(updateProjectAction).not.toHaveBeenCalled();
  });
  it("replaces the editor with the persisted tracking fact when a check wins the race", async () => {
    const measured = { ...project, trackingStartedAt: "2026-09-04T12:00:00.000Z" };
    const onComplete = vi.fn();
    step({
      onComplete,
      updateProjectAction: async () => ({
        ok: false,
        error: { code: "PROJECT_HAS_RANK_CHECKS" },
        project: measured,
      }),
    });
    fireEvent.change(screen.getByLabelText("Your website"), { target: { value: "tes.co" } });
    fireEvent.click(screen.getByText("Continue"));
    expect(await screen.findByRole("status")).toHaveTextContent("Tracking example.com since");
    expect(screen.queryByLabelText("Your website")).not.toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Continue"));
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith({ website: "example.com" }, measured),
    );
  });
  it("starts read-only after refresh when tracking already exists", () => {
    step({ initialProject: { ...project, trackingStartedAt: "2026-09-04T12:00:00.000Z" } });
    expect(screen.queryByLabelText("Your website")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Tracking example.com since");
  });
});
