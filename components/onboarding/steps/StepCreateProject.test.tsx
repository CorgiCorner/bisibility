import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type CreateProjectFormValues, StepCreateProject } from "./StepCreateProject";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const project = {
  domain: "example.com",
  id: "project_1",
  name: "Example",
  publicId: "prj_1",
};

function defaultValues(values: Partial<CreateProjectFormValues> = {}): CreateProjectFormValues {
  return {
    domain: "example.com",
    includeSubdomains: false,
    name: "Example",
    rootAndWww: true,
    urlPrefix: false,
    ...values,
  };
}

function renderCreateProjectStep(props: Partial<ComponentProps<typeof StepCreateProject>> = {}) {
  return render(
    <StepCreateProject
      defaultValues={defaultValues()}
      saveMatchingScopeAction={vi.fn(async () => undefined)}
      {...props}
    />,
  );
}

describe("StepCreateProject", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("starts blank with placeholder examples instead of fixture values", () => {
    render(<StepCreateProject />);

    expect(screen.getByLabelText("Project name")).toHaveValue("");
    expect(screen.getByLabelText("Project name")).toHaveAttribute("placeholder", "e.g. Acme");
    expect(screen.getByLabelText("Domain")).toHaveValue("");
    expect(screen.getByLabelText("Domain")).toHaveAttribute("placeholder", "example.com");
    expect(screen.queryByText("Rank granularity")).not.toBeInTheDocument();
  });

  it("uses product-style scope labels with the current project domain", () => {
    renderCreateProjectStep();

    expect(screen.getByText("Primary domain + www")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Counts example.com and www.example.com across HTTP and HTTPS. Other subdomains stay separate.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("All subdomains")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Also counts docs.example.com, app.example.com, blog.example.com, and any other subdomain.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("URL prefix only")).toBeInTheDocument();
    expect(
      screen.getByText("Only counts pages under a specific path, for example example.com/docs/."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Track acme\.dev/)).not.toBeInTheDocument();
  });

  it("creates the project, saves matching scope, and advances after both actions succeed", async () => {
    const createProjectAction = vi.fn(async () => project);
    const saveMatchingScopeAction = vi.fn(async () => undefined);
    const onComplete = vi.fn();
    const { container } = renderCreateProjectStep({
      createProjectAction,
      defaultValues: defaultValues({ includeSubdomains: true, urlPrefix: true }),
      onComplete,
      saveMatchingScopeAction,
    });

    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(saveMatchingScopeAction).toHaveBeenCalledTimes(1));
    expect(createProjectAction).toHaveBeenCalledWith({
      domain: "example.com",
      name: "Example",
    });
    expect(saveMatchingScopeAction).toHaveBeenCalledWith({
      includeSubdomains: true,
      projectId: "prj_1",
      rootAndWww: true,
      urlPrefix: true,
    });
    expect(createProjectAction.mock.invocationCallOrder[0]).toBeLessThan(
      saveMatchingScopeAction.mock.invocationCallOrder[0],
    );
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ domain: "example.com", name: "Example" }),
      project,
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("surfaces create failures without saving scope or advancing", async () => {
    const createProjectAction = vi.fn(async () => {
      throw new Error("Project failed");
    });
    const saveMatchingScopeAction = vi.fn(async () => undefined);
    const onComplete = vi.fn();
    const { container } = renderCreateProjectStep({
      createProjectAction,
      onComplete,
      saveMatchingScopeAction,
    });

    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    expect(await screen.findByText("Project failed")).toBeInTheDocument();
    expect(saveMatchingScopeAction).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("surfaces matching-scope failures without advancing", async () => {
    const createProjectAction = vi.fn(async () => project);
    const saveMatchingScopeAction = vi.fn(async () => {
      throw new Error("Scope failed");
    });
    const onComplete = vi.fn();
    const { container } = renderCreateProjectStep({
      createProjectAction,
      onComplete,
      saveMatchingScopeAction,
    });

    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    expect(await screen.findByText("Scope failed")).toBeInTheDocument();
    expect(createProjectAction).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
