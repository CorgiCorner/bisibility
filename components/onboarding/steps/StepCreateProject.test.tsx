import { onboardingFormId } from "@/components/onboarding/onboarding-form-utils";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type CreateProjectFormValues, StepCreateProject } from "./StepCreateProject";

const project = {
  domain: "example.com",
  id: "project_1",
  name: "example",
  publicId: "prj_1",
};

function defaultValues(values: Partial<CreateProjectFormValues> = {}): CreateProjectFormValues {
  return { website: "example.com", ...values };
}

function renderCreateProjectStep(props: Partial<ComponentProps<typeof StepCreateProject>> = {}) {
  return render(
    <>
      <StepCreateProject defaultValues={defaultValues()} {...props} />
      <button form={onboardingFormId} type="submit">
        Continue
      </button>
    </>,
  );
}

function submitProject() {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("StepCreateProject", () => {
  beforeEach(() => {
    routerMock.push.mockClear();
  });

  it("starts with one blank website field", () => {
    render(<StepCreateProject />);

    expect(screen.getByLabelText("Your website")).toHaveValue("");
    expect(screen.getByLabelText("Your website")).toHaveAttribute(
      "placeholder",
      "https://example.com",
    );
    expect(screen.queryByLabelText("Project name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Domain")).not.toBeInTheDocument();
  });

  it("shows the server-derived name without rewriting the entered URL", async () => {
    const deriveWebsiteAction = vi.fn(async () => ({
      domain: "example.co.uk",
      name: "example",
    }));
    render(<StepCreateProject deriveWebsiteAction={deriveWebsiteAction} />);
    const website = screen.getByLabelText("Your website");

    fireEvent.change(website, {
      target: { value: "https://www.example.co.uk/products?source=onboarding" },
    });
    fireEvent.blur(website);

    expect(await screen.findByText("example")).toBeInTheDocument();
    expect(deriveWebsiteAction).toHaveBeenCalledWith({
      website: "https://www.example.co.uk/products?source=onboarding",
    });
    expect(website).toHaveValue("https://www.example.co.uk/products?source=onboarding");
  });

  it("ignores a stale preview after the user keeps editing", async () => {
    let resolvePreview: ((value: { domain: string; name: string }) => void) | undefined;
    const deriveWebsiteAction = vi.fn(
      () =>
        new Promise<{ domain: string; name: string }>((resolve) => {
          resolvePreview = resolve;
        }),
    );
    render(<StepCreateProject deriveWebsiteAction={deriveWebsiteAction} />);
    const website = screen.getByLabelText("Your website");

    fireEvent.change(website, { target: { value: "first.example.com" } });
    fireEvent.blur(website);
    await waitFor(() => expect(deriveWebsiteAction).toHaveBeenCalledTimes(1));
    fireEvent.change(website, { target: { value: "second.example.com" } });
    resolvePreview?.({ domain: "example.com", name: "stale-name" });

    await waitFor(() => expect(screen.queryByText("Checking website...")).not.toBeInTheDocument());
    expect(screen.queryByText("stale-name")).not.toBeInTheDocument();
    expect(website).toHaveValue("second.example.com");
  });

  it("creates the project from the website input only", async () => {
    const createProjectAction = vi.fn(async () => project);
    const onComplete = vi.fn();
    renderCreateProjectStep({ browserTimezone: "Europe/Madrid", createProjectAction, onComplete });

    submitProject();

    await waitFor(() => expect(createProjectAction).toHaveBeenCalledTimes(1));
    expect(createProjectAction).toHaveBeenCalledWith({
      website: "example.com",
      timezone: "Europe/Madrid",
    });
    expect(onComplete).toHaveBeenCalledWith({ website: "example.com" }, project);
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("sends the resolved browser timezone but keeps onComplete to visible form values", async () => {
    const createProjectAction = vi.fn(async () => ({ ...project, timezone: "Europe/Madrid" }));
    const onComplete = vi.fn();
    renderCreateProjectStep({ browserTimezone: "Europe/Madrid", createProjectAction, onComplete });

    submitProject();

    await waitFor(() => expect(createProjectAction).toHaveBeenCalledTimes(1));
    expect(createProjectAction).toHaveBeenCalledWith({
      website: "example.com",
      timezone: "Europe/Madrid",
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    const [values, created] = onComplete.mock.calls[0];
    expect(values).toEqual({ website: "example.com" });
    expect(values).not.toHaveProperty("timezone");
    expect(created).toMatchObject({ publicId: "prj_1", timezone: "Europe/Madrid" });
  });

  it("surfaces create failures without advancing", async () => {
    const createProjectAction = vi.fn(async () => {
      throw new Error("Project failed");
    });
    const onComplete = vi.fn();
    renderCreateProjectStep({ createProjectAction, onComplete });

    submitProject();

    expect(await screen.findByText("Project failed")).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
  });
});
