import { renderWithSharedMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { generalPreference } from "@/lib/project-surface-preferences/model";
import {
  canonicalViewFixture,
  keywordViewFixture,
  viewProjectId,
} from "@/lib/saved-views/view-test-fixture";
import shared from "@/messages/core/en/shared.json";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PersonalSaveViewModal } from "./PersonalSaveViewModal";
import type { PersonalSavedViewsControlProps } from "./personal-control-types";

function setup() {
  const view = canonicalViewFixture();
  let resolve!: (value: { ok: true; value: typeof view }) => void;
  const pending = new Promise<{ ok: true; value: typeof view }>((done) => {
    resolve = done;
  });
  const props: PersonalSavedViewsControlProps = {
    activeViewId: view.id,
    canCreateShared: true,
    canCreatePrivate: true,
    config: keywordViewFixture(),
    createAction: vi.fn(() => pending),
    deleteAction: vi.fn(),
    updateAction: vi.fn(),
    setDefaultAction: vi.fn(),
    labels: shared.shared.personalViews,
    modified: true,
    onDiscard: vi.fn(),
    onRefresh: vi.fn(),
    onSelect: vi.fn(),
    preference: generalPreference(viewProjectId, "keywords"),
    projectId: viewProjectId,
    scopeKey: "pending-save",
    scopeSummary: "Mobile",
    views: [view],
  };
  const onClose = vi.fn(),
    onSaved = vi.fn();
  render(<PersonalSaveViewModal props={props} onClose={onClose} onSaved={onSaved} />);
  const input = screen.getByRole("textbox", { name: "Name" });
  fireEvent.change(input, { target: { value: "My view" } });
  const form = input.closest("form");
  if (!form) throw new Error("Expected Save as form");
  return {
    props,
    onClose,
    onSaved,
    input,
    form,
    resolve: () => resolve({ ok: true, value: view }),
  };
}
describe("Save as pending request", () => {
  it("keeps dismissal and editing locked until the create settles", async () => {
    const f = setup();
    fireEvent.submit(f.form);
    await waitFor(() => expect(f.props.createAction).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(f.input).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Project" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(f.onClose).not.toHaveBeenCalled();
    await act(async () => f.resolve());
    expect(f.onSaved).toHaveBeenCalledOnce();
  });
  it("admits only one create for overlapping direct form submissions", async () => {
    const f = setup();
    fireEvent.submit(f.form);
    await waitFor(() => expect(f.props.createAction).toHaveBeenCalledOnce());
    fireEvent.change(f.input, { target: { value: "Another name" } });
    fireEvent.submit(f.form);
    await act(async () => Promise.resolve());
    expect(f.props.createAction).toHaveBeenCalledOnce();
    await act(async () => f.resolve());
  });
});
