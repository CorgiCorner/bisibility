import { TagsSegmentsCard } from "@/components/settings/general/TagsSegmentsCard";
import { routerMock } from "@/tests/next-navigation";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tags = [
  { color: "var(--blue)", keywordCount: 0, label: "product", segmentCount: 0 },
  { color: "var(--green)", keywordCount: 3, label: "guides", segmentCount: 1 },
];

describe("TagsSegmentsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses a dashed ghost chip for the add affordance", () => {
    render(
      <TagsSegmentsCard
        canCreate
        canDelete
        createTag={vi.fn()}
        deleteTag={vi.fn()}
        projectId="prj_7Kd2Qf9m"
        tags={tags}
      />,
    );

    const addTag = screen.getByRole("button", { name: "Add tag" });
    expect(addTag.closest("span")).toHaveClass("border-dashed");
    expect(addTag.closest("span")).not.toHaveClass("bg-bg-sidebar");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("creates a tag immediately on Enter without a card Save step", async () => {
    const user = userEvent.setup();
    const createTag = vi.fn().mockResolvedValue({ ok: true, value: { created: true } });
    render(
      <TagsSegmentsCard
        canCreate
        canDelete
        createTag={createTag}
        deleteTag={vi.fn()}
        projectId="prj_7Kd2Qf9m"
        tags={tags}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add tag" }));
    await user.type(screen.getByLabelText("New tag name"), "research{Enter}");

    await waitFor(() =>
      expect(createTag).toHaveBeenCalledWith({ name: "research", projectId: "prj_7Kd2Qf9m" }),
    );
    expect(screen.getByText("research")).toBeVisible();
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it("shows a server duplicate as inline copy instead of rejecting the add", async () => {
    const user = userEvent.setup();
    const createTag = vi.fn().mockResolvedValue({
      error: { code: "conflict", message: "Tag already exists.", status: 409 },
      ok: false,
    });
    render(
      <TagsSegmentsCard
        canCreate
        canDelete
        createTag={createTag}
        deleteTag={vi.fn()}
        projectId="prj_7Kd2Qf9m"
        tags={tags}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add tag" }));
    await user.type(screen.getByLabelText("New tag name"), "research{Enter}");

    await waitFor(() => expect(screen.getByText("Tag already exists.")).toBeVisible());
    expect(screen.queryByText("research")).not.toBeInTheDocument();
  });

  it("shows duplicate errors below the row", async () => {
    const user = userEvent.setup();
    render(
      <TagsSegmentsCard
        canCreate
        canDelete
        createTag={vi.fn()}
        deleteTag={vi.fn()}
        projectId="prj_7Kd2Qf9m"
        tags={tags}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add tag" }));
    await user.type(screen.getByLabelText("New tag name"), "product{Enter}");

    expect(screen.getByText("product already exists.")).toBeVisible();
  });

  it("removes unused tags immediately and confirms tags that are in use", async () => {
    const user = userEvent.setup();
    const deleteTag = vi.fn().mockResolvedValue({ ok: true, value: { deleted: 1 } });
    render(
      <TagsSegmentsCard
        canCreate
        canDelete
        createTag={vi.fn()}
        deleteTag={deleteTag}
        projectId="prj_7Kd2Qf9m"
        tags={tags}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove product" }));
    await waitFor(() =>
      expect(deleteTag).toHaveBeenCalledWith({ name: "product", projectId: "prj_7Kd2Qf9m" }),
    );
    expect(screen.queryByText("product")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove guides" }));
    expect(screen.getByRole("dialog", { name: "Remove guides?" })).toBeInTheDocument();
    expect(screen.getByText("3 keywords and 1 segment use it.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Remove tag" }));
    await waitFor(() =>
      expect(deleteTag).toHaveBeenCalledWith({ name: "guides", projectId: "prj_7Kd2Qf9m" }),
    );
  });

  it("renders a deletion error for an unused tag without rejecting the click handler", async () => {
    const user = userEvent.setup();
    const deleteTag = vi.fn().mockResolvedValue({
      error: { code: "FORBIDDEN", message: "Tag could not be removed." },
      ok: false,
    });
    render(
      <TagsSegmentsCard
        canCreate
        canDelete
        createTag={vi.fn()}
        deleteTag={deleteTag}
        projectId="prj_7Kd2Qf9m"
        tags={tags}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove product" }));

    await waitFor(() => expect(screen.getByText("Tag could not be removed.")).toBeVisible());
    expect(screen.getByText("product")).toBeVisible();
  });

  it("shows keyword usage on chips", () => {
    render(
      <TagsSegmentsCard
        canCreate
        canDelete
        createTag={vi.fn()}
        deleteTag={vi.fn()}
        projectId="prj_7Kd2Qf9m"
        tags={tags}
      />,
    );

    expect(screen.getByText("guides", { exact: false })).toBeVisible();
    expect(screen.getByText("3", { exact: false })).toBeVisible();
    expect(screen.queryByText("product ·")).not.toBeInTheDocument();
  });
});
