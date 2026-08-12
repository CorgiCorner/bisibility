import { ProjectDetailsCard } from "@/components/settings/general/ProjectDetailsCard";
import { routerMock } from "@/tests/next-navigation";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const project = {
  domain: "example.com",
  name: "Example",
  projectId: "prj_7Kd2Qf9m",
};

describe("ProjectDetailsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps Save disabled until the project name is dirty, then uses the audited action", async () => {
    const user = userEvent.setup();
    const requestDomainChange = vi.fn().mockResolvedValue(undefined);
    const updateProject = vi.fn().mockResolvedValue({ name: "Example Labs" });
    render(
      <ProjectDetailsCard
        canEdit
        project={project}
        requestDomainChange={requestDomainChange}
        updateProject={updateProject}
      />,
    );

    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    await user.clear(screen.getByLabelText("Project name"));
    await user.type(screen.getByLabelText("Project name"), "Example Labs");
    expect(save).toBeEnabled();

    await user.click(save);

    await waitFor(() =>
      expect(updateProject).toHaveBeenCalledWith({
        name: "Example Labs",
        projectId: "prj_7Kd2Qf9m",
      }),
    );
    expect(await screen.findByText("Saved")).toBeVisible();
    expect(routerMock.refresh).toHaveBeenCalledOnce();
  });

  it("renders the wired domain confirmation action separately from the name action", async () => {
    const user = userEvent.setup();
    const requestDomainChange = vi.fn().mockResolvedValue(undefined);
    const updateProject = vi.fn();
    render(
      <ProjectDetailsCard
        canEdit
        project={project}
        requestDomainChange={requestDomainChange}
        updateProject={updateProject}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Change domain" }));

    const dialog = screen.getByRole("dialog", { name: "Confirm a new project domain" });
    expect(dialog).toHaveTextContent(
      "Change the domain this project uses to identify its matching results.",
    );
    expect(dialog).toHaveTextContent(
      "Existing checks keep their original results. Future checks use the new domain and its subdomains to identify project matches.",
    );
    expect(dialog).toHaveTextContent(
      "Competitor history stays tied to the domain that was used when each check ran.",
    );
    expect(dialog).not.toHaveTextContent("Stop at first match");
    expect(dialog).toHaveTextContent("Type example.com to confirm");
    expect(screen.getByRole("button", { name: "Confirm domain change" })).toBeDisabled();
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("keeps domain-change consequences inside the confirmation modal", () => {
    render(
      <ProjectDetailsCard
        canEdit
        project={project}
        requestDomainChange={vi.fn()}
        updateProject={vi.fn()}
      />,
    );

    expect(screen.queryByText("The domain confirmation says")).not.toBeInTheDocument();
  });

  it("keeps focus in the confirmation dialog and returns it after Escape", async () => {
    const user = userEvent.setup();
    const requestDomainChange = vi.fn().mockResolvedValue(undefined);
    const updateProject = vi.fn();
    render(
      <ProjectDetailsCard
        canEdit
        project={project}
        requestDomainChange={requestDomainChange}
        updateProject={updateProject}
      />,
    );

    const changeDomain = screen.getByRole("button", { name: "Change domain" });
    await user.click(changeDomain);
    await user.tab();
    expect(screen.getByRole("button", { name: "Close modal" })).toHaveFocus();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(changeDomain).toHaveFocus();
  });

  it("passes a confirmed domain request only through the supplied boundary action", async () => {
    const user = userEvent.setup();
    const requestDomainChange = vi.fn().mockResolvedValue(undefined);
    const updateProject = vi.fn();
    render(
      <ProjectDetailsCard
        canEdit
        project={project}
        requestDomainChange={requestDomainChange}
        updateProject={updateProject}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Change domain" }));
    await user.clear(screen.getByLabelText("New domain"));
    await user.type(screen.getByLabelText("New domain"), "next.example.com");
    expect(screen.getByRole("button", { name: "Confirm domain change" })).toBeDisabled();
    const confirmation = screen.getByLabelText("Type example.com to confirm");
    await user.type(confirmation, "wrong.example.com");
    expect(screen.getByRole("button", { name: "Confirm domain change" })).toBeDisabled();
    await user.clear(confirmation);
    await user.type(confirmation, "example.com");
    await user.click(screen.getByRole("button", { name: "Confirm domain change" }));

    await waitFor(() =>
      expect(requestDomainChange).toHaveBeenCalledWith({
        confirmationDomain: "example.com",
        newDomain: "next.example.com",
        projectId: "prj_7Kd2Qf9m",
      }),
    );
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("allows setting the first domain only while the confirmation stays blank", async () => {
    const user = userEvent.setup();
    const requestDomainChange = vi.fn().mockResolvedValue(undefined);
    const updateProject = vi.fn();
    render(
      <ProjectDetailsCard
        canEdit
        project={{ ...project, domain: null }}
        requestDomainChange={requestDomainChange}
        updateProject={updateProject}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Change domain" }));
    const confirmation = screen.getByLabelText("Leave confirmation blank to set the first domain");
    await user.type(screen.getByLabelText("New domain"), "first.example.com");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Confirm domain change" })).toBeEnabled(),
    );

    await user.type(confirmation, "example.com");
    expect(screen.getByRole("button", { name: "Confirm domain change" })).toBeDisabled();
    await user.clear(confirmation);
    await user.click(screen.getByRole("button", { name: "Confirm domain change" }));

    await waitFor(() =>
      expect(requestDomainChange).toHaveBeenCalledWith({
        confirmationDomain: "",
        newDomain: "first.example.com",
        projectId: "prj_7Kd2Qf9m",
      }),
    );
    expect(updateProject).not.toHaveBeenCalled();
  });
});
