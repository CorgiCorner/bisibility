import {
  northBranch,
  ownerPermissions,
  projectId,
  businessFixtureTranslate as translate,
  unassigned,
} from "@/components/business-locations/test-fixtures";
import { renderWithSharedMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ search: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/business-location-store/session-actions", () => ({
  searchBusinessAssignmentScopes: actions.search,
  readBusinessAssignmentCurrent: actions.read,
  saveBusinessAssignment: actions.save,
}));

import { BusinessAssignmentWorkspace } from "./BusinessAssignmentWorkspace";

function workspace() {
  render(
    <BusinessAssignmentWorkspace
      projectId={projectId}
      locations={[northBranch]}
      permissions={ownerPermissions}
      translate={translate}
    />,
  );
}
describe("business assignment scope search", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    actions.search.mockResolvedValue({ choices: [], next: null });
  });
  it("submits Enter through the existing trimmed search schema", async () => {
    workspace();
    await userEvent
      .setup()
      .type(screen.getByRole("searchbox", { name: "Search" }), " cafe {Enter}");
    expect(actions.search).toHaveBeenCalledExactlyOnceWith(projectId, {
      kind: "keyword",
      search: "cafe",
      after: null,
    });
    expect(actions.save).not.toHaveBeenCalled();
  });
  it("clears the search draft without reading or changing an assignment", async () => {
    workspace();
    const user = userEvent.setup();
    const search = screen.getByRole("searchbox", { name: "Search" });
    await user.type(search, "cafe");
    await user.click(screen.getByRole("button", { name: "Clear Search" }));
    expect(search).toHaveValue("");
    expect(actions.search).not.toHaveBeenCalled();
    expect(actions.read).not.toHaveBeenCalled();
    expect(actions.save).not.toHaveBeenCalled();
  });
  it("still blocks oversized searches at the shared form schema", async () => {
    workspace();
    const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox", { name: "Search" }), "x".repeat(201));
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(actions.search).not.toHaveBeenCalled();
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
  it("reads a chosen scope without assigning the selected branch implicitly", async () => {
    actions.search.mockResolvedValue({
      choices: [{ scope: unassigned.scope, name: "Cafe", location: "Warsaw", device: "desktop" }],
      next: null,
    });
    actions.read.mockResolvedValue(unassigned);
    workspace();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(
      await screen.findByRole("button", { name: "Keyword: Cafe · Warsaw · Desktop" }),
    );
    expect(actions.read).toHaveBeenCalledExactlyOnceWith(projectId, unassigned.scope);
    expect(await screen.findByRole("button", { name: "Subject branch" })).toBeInTheDocument();
    expect(actions.save).not.toHaveBeenCalled();
  });
});
