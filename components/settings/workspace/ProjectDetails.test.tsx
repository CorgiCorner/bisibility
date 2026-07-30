import { canProjectAction } from "@/lib/auth/capabilities";
import type { Role } from "@/lib/generated/prisma/client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectDetails } from "./ProjectDetails";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

const project = {
  domain: "example.com",
  name: "Example",
  projectId: "prj_1",
};

describe("ProjectDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders project details without the tracking scope selector", () => {
    render(<ProjectDetails canEdit project={project} updateProject={vi.fn()} />);

    expect(screen.getByLabelText("Project name")).toHaveValue("Example");
    expect(screen.getByLabelText("Domain")).toHaveValue("example.com");
    expect(screen.getByText("prj_1")).toHaveClass("text-[13px]", "font-medium");
    expect(screen.queryByText("Tracking scope")).not.toBeInTheDocument();
  });

  it("saves only project identity fields", async () => {
    const updateProject = vi.fn(async () => ({ name: "Example Labs" }));
    const { container } = render(
      <ProjectDetails canEdit project={project} updateProject={updateProject} />,
    );

    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Example Labs" },
    });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() =>
      expect(updateProject).toHaveBeenCalledWith({
        domain: "example.com",
        name: "Example Labs",
        projectId: "prj_1",
      }),
    );
    expect(await screen.findByText("Project details saved.")).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it.each(["viewer", "auditor", "member", "admin", "owner"] satisfies Role[])(
    "renders project identity fields for the %s role at the update threshold",
    (role) => {
      const canEdit = canProjectAction(role, "update", "project");
      render(<ProjectDetails canEdit={canEdit} project={project} updateProject={vi.fn()} />);

      expect(screen.getByLabelText("Project name")).toHaveProperty("disabled", !canEdit);
      expect(screen.getByLabelText("Domain")).toHaveProperty("disabled", !canEdit);
    },
  );
});
