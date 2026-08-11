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
    name: "Example",
    ...values,
  };
}

function renderCreateProjectStep(props: Partial<ComponentProps<typeof StepCreateProject>> = {}) {
  return render(<StepCreateProject defaultValues={defaultValues()} {...props} />);
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
    expect(
      screen.getByText(
        "www and every subdomain of your domain count as yours - matching is fixed today, per-scope control is on the roadmap.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Rank granularity")).not.toBeInTheDocument();
  });

  it("does not render inactive matching-scope controls", () => {
    renderCreateProjectStep();

    expect(screen.queryByText("Primary domain + www")).not.toBeInTheDocument();
    expect(screen.queryByText("All subdomains")).not.toBeInTheDocument();
    expect(screen.queryByText("URL prefix only")).not.toBeInTheDocument();
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
    expect(importButton).toHaveAccessibleName(
      "Migrating from a self-hosted instance? Import it instead",
    );
    expect(importButton).toHaveClass("MuiButton-root");
    // The sentence and the underlined link are separate flex items, and a whitespace-only
    // anonymous item collapses to zero width - the JSX space between them renders as nothing.
    // The column gap restores it, in em so it tracks the font size. Asserted as a class because
    // jsdom does not apply Tailwind, so the computed value is unavailable here.
    expect(importButton).toHaveClass("gap-x-[0.25em]");
    fireEvent.click(importButton);

    await waitFor(() => expect(mocks.createCloudImportWorkspace).toHaveBeenCalledOnce());

    rerender(<StepCreateProject defaultValues={defaultValues()} isCloud={false} />);

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

  it("creates the project without includeSubdomains, rootAndWww, or urlPrefix", async () => {
    const createProjectAction = vi.fn(async (_input: unknown) => project);
    const saveMatchingScopeAction = vi.fn(async () => undefined);
    const onComplete = vi.fn();
    const { container } = renderCreateProjectStep({
      createProjectAction,
      onComplete,
      ...({ saveMatchingScopeAction } as Partial<ComponentProps<typeof StepCreateProject>>),
    });

    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(createProjectAction).toHaveBeenCalledTimes(1));
    expect(createProjectAction).toHaveBeenCalledWith({
      domain: "example.com",
      name: "Example",
    });
    expect(createProjectAction.mock.calls[0][0]).not.toHaveProperty("includeSubdomains");
    expect(createProjectAction.mock.calls[0][0]).not.toHaveProperty("rootAndWww");
    expect(createProjectAction.mock.calls[0][0]).not.toHaveProperty("urlPrefix");
    expect(saveMatchingScopeAction).not.toHaveBeenCalled();
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
      ...({ saveMatchingScopeAction } as Partial<ComponentProps<typeof StepCreateProject>>),
    });

    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    expect(await screen.findByText("Project failed")).toBeInTheDocument();
    expect(saveMatchingScopeAction).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("ignores the legacy matching-scope action", async () => {
    const createProjectAction = vi.fn(async () => project);
    const saveMatchingScopeAction = vi.fn(async () => {
      throw new Error("Scope failed");
    });
    const onComplete = vi.fn();
    const { container } = renderCreateProjectStep({
      createProjectAction,
      onComplete,
      ...({ saveMatchingScopeAction } as Partial<ComponentProps<typeof StepCreateProject>>),
    });

    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(createProjectAction).toHaveBeenCalledTimes(1));
    expect(saveMatchingScopeAction).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ domain: "example.com", name: "Example" }),
      project,
    );
  });
});
