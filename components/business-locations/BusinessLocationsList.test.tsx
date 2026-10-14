import { renderWithSharedMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BusinessLocationsList } from "./BusinessLocationsList";
import {
  archivedBranch,
  northBranch,
  ownerPermissions,
  southBranch,
  businessFixtureTranslate as t,
  viewerPermissions,
} from "./test-fixtures";

describe("business branch list", () => {
  it("keeps same-domain branches distinct, defaults active, and inspection is not subject assignment", async () => {
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    const onState = vi.fn();
    render(
      <BusinessLocationsList
        locations={[northBranch, southBranch, archivedBranch]}
        selectedLocationId={null}
        permissions={ownerPermissions}
        translate={t}
        onSelect={onSelect}
        onCreate={vi.fn()}
        onEdit={onEdit}
        onState={onState}
      />,
    );
    expect(screen.queryByText(archivedBranch.identity.name)).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: southBranch.identity.name }));
    expect(onSelect).toHaveBeenCalledWith(southBranch.publicId);
    expect(onEdit).not.toHaveBeenCalled();
    expect(onState).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Show locations" }));
    await user.click(await screen.findByRole("menuitem", { name: "Archived" }));
    expect(screen.getByRole("button", { name: archivedBranch.identity.name })).toBeInTheDocument();
    expect(screen.queryByText(northBranch.identity.name)).not.toBeInTheDocument();
  });
  it("lets a viewer inspect a branch but exposes no mutation actions", async () => {
    const onSelect = vi.fn();
    const mutate = vi.fn();
    render(
      <BusinessLocationsList
        locations={[northBranch]}
        selectedLocationId={northBranch.publicId}
        permissions={viewerPermissions}
        translate={t}
        onSelect={onSelect}
        onCreate={mutate}
        onEdit={mutate}
        onState={mutate}
      />,
    );
    expect(screen.getByRole("button", { name: northBranch.identity.name })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("button", { name: "Add business location" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: northBranch.identity.name }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(mutate).not.toHaveBeenCalled();
  });
  it("renders nothing without authorized read capability", () => {
    const { container } = render(
      <BusinessLocationsList
        locations={[northBranch]}
        selectedLocationId={null}
        permissions={{ canRead: false, canWrite: true }}
        translate={t}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onState={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
