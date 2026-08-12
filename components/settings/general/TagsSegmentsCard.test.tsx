import { TagsSegmentsCard } from "@/components/settings/general/TagsSegmentsCard";
import { routerMock } from "@/tests/next-navigation";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tags = [
  { color: "var(--blue)", label: "product" },
  { color: "var(--green)", label: "guides" },
];

describe("TagsSegmentsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps tag additions local until the card Save is used", async () => {
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
    await user.type(screen.getByLabelText("New tag name"), "research");
    await user.click(screen.getByRole("button", { name: "Add tag" }));

    expect(screen.getByText("research")).toBeVisible();
    expect(createTag).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(createTag).toHaveBeenCalledWith({ name: "research", projectId: "prj_7Kd2Qf9m" }),
    );
    expect(await screen.findByText("Saved")).toBeVisible();
    expect(routerMock.refresh).toHaveBeenCalledOnce();
  });

  it("stages removals locally before the audited delete action runs", async () => {
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
    expect(deleteTag).not.toHaveBeenCalled();
    expect(screen.queryByText("product")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(deleteTag).toHaveBeenCalledWith({ name: "product", projectId: "prj_7Kd2Qf9m" }),
    );
  });
});
