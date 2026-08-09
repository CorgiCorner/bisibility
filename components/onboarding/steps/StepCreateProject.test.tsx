import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type CreateProjectFormValues, StepCreateProject } from "./StepCreateProject";

const push = vi.fn();
const mocks = vi.hoisted(() => ({
  createCloudImportWorkspace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));
vi.mock("@/lib/actions/cloud", () => ({
  createCloudImportWorkspace: mocks.createCloudImportWorkspace,
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
    mocks.createCloudImportWorkspace.mockReset();
    mocks.createCloudImportWorkspace.mockResolvedValue(
      "/cloud/import?ctx=onboard&project=prj_bbcdefghijklmnopqrstuvwx",
    );
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

  it("offers a self-hosted import action only on cloud deployments", async () => {
    const { rerender } = renderCreateProjectStep({ isCloud: true });

    const importButton = screen.getByRole("button", {
      name: "Migrating from a self-hosted instance? Import it instead",
    });
    expect(importButton.closest("form")).toHaveClass(
      "mt-6",
      "rounded-xl",
      "border",
      "border-border-strong",
      "bg-transparent",
      "p-4",
    );
    fireEvent.click(importButton);

    await waitFor(() => expect(mocks.createCloudImportWorkspace).toHaveBeenCalledOnce());

    rerender(
      <StepCreateProject
        defaultValues={defaultValues()}
        isCloud={false}
        saveMatchingScopeAction={vi.fn(async () => undefined)}
      />,
    );

    expect(
      screen.queryByRole("button", {
        name: "Migrating from a self-hosted instance? Import it instead",
      }),
    ).not.toBeInTheDocument();
  });

  it("uses router scroll management after creating an import project", async () => {
    const destination = "/cloud/import?ctx=onboard&project=prj_bbcdefghijklmnopqrstuvwx";
    mocks.createCloudImportWorkspace.mockResolvedValue(destination);
    renderCreateProjectStep({ isCloud: true });

    const importButton = screen.getByRole("button", {
      name: "Migrating from a self-hosted instance? Import it instead",
    });
    fireEvent.submit(importButton.closest("form") as HTMLFormElement);

    await waitFor(() => expect(mocks.createCloudImportWorkspace).toHaveBeenCalledOnce());
    expect(push).toHaveBeenCalledWith(destination, { scroll: true });
  });

  it("disables the import action while its project is being created", async () => {
    let resolveImport: ((destination: string) => void) | undefined;
    mocks.createCloudImportWorkspace.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveImport = resolve;
        }),
    );
    renderCreateProjectStep({ isCloud: true });

    const importButton = screen.getByRole("button", {
      name: "Migrating from a self-hosted instance? Import it instead",
    });
    fireEvent.click(importButton);

    await waitFor(() => expect(importButton).toBeDisabled());
    expect(importButton).toHaveTextContent("Opening import...");
    fireEvent.click(importButton);
    expect(mocks.createCloudImportWorkspace).toHaveBeenCalledOnce();

    resolveImport?.("/cloud/import?ctx=onboard&project=prj_bbcdefghijklmnopqrstuvwx");
    await waitFor(() => expect(importButton).not.toBeDisabled());
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
