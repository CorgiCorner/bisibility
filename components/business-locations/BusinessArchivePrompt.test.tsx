import { renderWithSharedMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BusinessArchivePrompt } from "./BusinessArchivePrompt";
import {
  northBranch,
  ownerPermissions,
  projectId,
  businessFixtureTranslate as t,
  viewerPermissions,
} from "./test-fixtures";

const props = () => ({
  projectId,
  location: northBranch,
  nextState: "archived" as const,
  permissions: ownerPermissions,
  translate: t,
  save: vi.fn().mockResolvedValue({ kind: "error" }),
  onSaved: vi.fn(),
  onCancel: vi.fn(),
  onFocusReturn: vi.fn(),
});
describe("append-only archive/restore prompt", () => {
  it("requires confirmation and uses state version, not identity revision", async () => {
    const input = props();
    render(<BusinessArchivePrompt {...input} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Confirm state change" }));
    expect(await screen.findByText(t("validation.confirmed"))).toBeInTheDocument();
    expect(input.save).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: t("archiveConfirmation") }));
    await user.click(screen.getByRole("button", { name: "Confirm state change" }));
    await waitFor(() =>
      expect(input.save).toHaveBeenCalledWith({
        projectId,
        locationId: northBranch.publicId,
        expectedVersion: 4,
        state: "archived",
        idempotencyKey: expect.any(String),
      }),
    );
  });
  it("clears confirmation on explicit review of a same-version registry conflict", async () => {
    const input = props();
    input.save
      .mockResolvedValueOnce({ kind: "conflict", current: northBranch })
      .mockResolvedValue({ kind: "error" });
    render(<BusinessArchivePrompt {...input} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Confirm state change" }));
    await screen.findByText(t("conflict"));
    await user.click(screen.getByRole("button", { name: "Use reviewed state version" }));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Confirm state change" }));
    expect(await screen.findByText(t("validation.confirmed"))).toBeInTheDocument();
    expect(input.save).toHaveBeenCalledTimes(1);
  });
  it("makes archive unavailable to a viewer and returns focus on cancel", async () => {
    const input = props();
    render(<BusinessArchivePrompt {...input} permissions={viewerPermissions} />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Confirm state change" })).toBeDisabled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Cancel" }));
    expect(input.onFocusReturn).toHaveBeenCalledOnce();
    expect(input.save).not.toHaveBeenCalled();
  });
});
