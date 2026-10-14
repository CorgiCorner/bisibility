import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { generalPreference } from "@/lib/project-surface-preferences/model";
import {
  canonicalViewFixture,
  keywordViewFixture,
  viewProjectId,
} from "@/lib/saved-views/view-test-fixture";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PersonalSavedViewsControl } from "./PersonalSavedViewsControl";
import type { PersonalSavedViewsControlProps } from "./personal-control-types";

function propsFixture(): PersonalSavedViewsControlProps {
  const view = canonicalViewFixture();
  return {
    activeViewId: view.id,
    canCreateShared: false,
    canCreatePrivate: true,
    config: keywordViewFixture(),
    createAction: vi.fn(async () => ({ ok: true as const, value: view })),
    deleteAction: vi.fn(async () => ({ ok: true as const, value: { deleted: true } })),
    labels: {
      cancel: "Cancel",
      conflict: "Reload before saving",
      latestRevision: "Latest revision",
      openLatest: "Open latest view in a new tab",
      reloadLatest: "Reload latest revision",
      reviewLatest: "Keep draft and use latest revision",
      delete: "Delete view",
      discard: "Discard",
      failed: "Save failed",
      general: "General",
      modified: "Unsaved changes",
      name: "View name",
      personal: "Personal",
      privateUnavailable: "Private views are not available yet.",
      privateSharing: "Choose Project to share this view with the project.",
      project: "Project",
      saveAs: "Save as",
      saved: "Saved",
      saveChanges: "Save changes",
      saving: "Saving",
      setDefault: "Set as my default",
      unavailableDefault: "Your default is unavailable",
      unavailableView: "View unavailable",
      visibility: "Visibility",
    },
    modified: true,
    onDiscard: vi.fn(),
    onRefresh: vi.fn(),
    onSelect: vi.fn(),
    preference: generalPreference(viewProjectId, "keywords"),
    projectId: viewProjectId,
    scopeKey: "session-a:project-a:keywords:v1",
    scopeSummary: "Krakow, mobile, Service",
    setDefaultAction: vi.fn(async () => ({
      ok: true as const,
      value: { ...generalPreference(viewProjectId, "keywords"), revision: 1 },
    })),
    updateAction: vi.fn(async () => ({ ok: true as const, value: { ...view, revision: 2 } })),
    views: [view],
  };
}

describe("personal saved-view explicit commands", () => {
  it("selects without writing the default and requires a separate default command", async () => {
    const props = propsFixture();
    render(<PersonalSavedViewsControl {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Service mobile" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "General" }));
    expect(props.onSelect).toHaveBeenCalledWith(null);
    expect(props.setDefaultAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Service mobile" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Set as my default" }));
    await waitFor(() =>
      expect(props.setDefaultAction).toHaveBeenCalledWith({
        expectedRevision: 0,
        projectId: viewProjectId,
        surface: "keywords",
        target: { kind: "saved_view", viewId: props.activeViewId },
      }),
    );
  });

  it("keeps a shared view unchanged while a viewer has an unsaved variant", () => {
    const props = propsFixture();
    props.views = props.views.map((view) => ({
      ...view,
      canDelete: false,
      canEdit: false,
      visibility: "project" as const,
    }));
    render(<PersonalSavedViewsControl {...props} />);
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save as" })).toBeEnabled();
    expect(props.updateAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(props.onDiscard).toHaveBeenCalledOnce();
    expect(props.createAction).not.toHaveBeenCalled();
  });

  it("renders a serialized CAS conflict while retaining the variant and previous default", async () => {
    const props = propsFixture();
    props.updateAction = vi.fn(async () => ({
      ok: false as const,
      error: { code: "conflict" as const, message: "Conflict", status: 409 as const },
    }));
    const before = structuredClone(props.preference);
    render(<PersonalSavedViewsControl {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Reload before saving");
    expect(props.preference).toEqual(before);
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.onRefresh).not.toHaveBeenCalled();
    expect(screen.getByText("Unsaved changes")).toBeVisible();
  });

  it("reloads after409 without discarding the draft, then explicitly reviews the new revision before retry", async () => {
    const props = propsFixture();
    props.updateAction = vi.fn(async () => ({
      ok: false as const,
      error: { code: "conflict" as const, message: "Conflict", status: 409 as const },
    }));
    const rendered = render(<PersonalSavedViewsControl {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reload latest revision" }));
    expect(props.onRefresh).toHaveBeenCalledOnce();
    expect(props.onDiscard).not.toHaveBeenCalled();
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Keep draft and use latest revision" }),
    ).not.toBeInTheDocument();
    rendered.rerender(
      <PersonalSavedViewsControl
        {...props}
        views={props.views.map((view) => ({ ...view, revision: 9 }))}
      />,
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByText("Unsaved changes")).toBeVisible();
    expect(screen.getByText("Latest revision: 9")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open latest view in a new tab" })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByRole("link", { name: "Open latest view in a new tab" })).toHaveAttribute(
      "href",
      expect.stringContaining(props.views[0].id),
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep draft and use latest revision" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(props.updateAction).toHaveBeenLastCalledWith(
        expect.objectContaining({
          config: props.config,
          expectedRevision: 9,
        }),
      ),
    );
    expect(props.onDiscard).not.toHaveBeenCalled();
  });

  it("refreshes and reviews the actual preference revision before retrying a default save", async () => {
    const props = propsFixture();
    props.setDefaultAction = vi.fn(async () => ({
      ok: false as const,
      error: { code: "conflict" as const, message: "Conflict", status: 409 as const },
    }));
    const rendered = render(<PersonalSavedViewsControl {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Service mobile" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Set as my default" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Reload latest revision" }));
    rendered.rerender(
      <PersonalSavedViewsControl {...props} preference={{ ...props.preference, revision: 3 }} />,
    );
    expect(screen.getByText("Latest revision: 3")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Keep draft and use latest revision" }));
    fireEvent.click(screen.getByRole("button", { name: "Service mobile" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Set as my default" }));
    await waitFor(() =>
      expect(props.setDefaultAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ expectedRevision: 3 }),
      ),
    );
    expect(props.onDiscard).not.toHaveBeenCalled();
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("defaults Save as to personal and reuses the same request ID for an unchanged failed submission", async () => {
    const props = propsFixture();
    const attempts: string[] = [];
    props.createAction = vi.fn(async (input) => {
      attempts.push(input.requestId);
      return {
        ok: false as const,
        error: { code: "unavailable" as const, message: "Unavailable", status: 503 as const },
      };
    });
    render(<PersonalSavedViewsControl {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Save as" }));
    expect(screen.getByRole("radio", { name: "Personal" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Project" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "View name" }), {
      target: { value: "My view" },
    });
    const form = screen.getByRole("textbox", { name: "View name" }).closest("form");
    if (!form) throw new Error("Expected the real saved-view form");
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
    fireEvent.submit(form);
    await waitFor(() => expect(attempts).toHaveLength(2));
    expect(attempts[1]).toBe(attempts[0]);
    expect(props.createAction).toHaveBeenCalledWith(
      expect.objectContaining({ name: "My view", visibility: "private" }),
    );
  });

  it("discards the former identity's unsaved modal when the session scope changes", () => {
    const props = propsFixture();
    const rendered = render(<PersonalSavedViewsControl {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Save as" }));
    fireEvent.change(screen.getByRole("textbox", { name: "View name" }), {
      target: { value: "Previous user draft" },
    });
    rendered.rerender(
      <PersonalSavedViewsControl {...props} scopeKey="session-b:project-a:keywords:v1" />,
    );
    expect(screen.queryByRole("textbox", { name: "View name" })).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Previous user draft")).not.toBeInTheDocument();
  });
});

it.each([false, true])(
  "blocks unavailable private submit without silently sharing (can share: %s)",
  async (canCreateShared) => {
    const props = { ...propsFixture(), canCreatePrivate: false, canCreateShared };
    render(<PersonalSavedViewsControl {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Save as" }));
    const modal = within(screen.getByRole("dialog"));
    const privateOption = modal.getByRole("radio", { name: "Personal" });
    expect(privateOption).toBeChecked();
    expect(privateOption).toBeDisabled();
    const projectOption = screen.getByRole("radio", { name: "Project" });
    expect(projectOption).not.toBeChecked();
    if (canCreateShared) expect(projectOption).toBeEnabled();
    else expect(projectOption).toBeDisabled();
    expect(modal.getByRole("status")).toHaveTextContent(props.labels.privateUnavailable);
    expect(modal.getByRole("button", { name: "Save as" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "View name" }), {
      target: { value: "Explicit shared" },
    });
    expect(props.createAction).not.toHaveBeenCalled();
    if (canCreateShared) {
      fireEvent.click(projectOption);
      fireEvent.click(modal.getByRole("button", { name: "Save as" }));
      await waitFor(() =>
        expect(props.createAction).toHaveBeenCalledWith(
          expect.objectContaining({ visibility: "project" }),
        ),
      );
    }
  },
);

it("shows the private gate reason when an allowed stale page receives a typed denial", async () => {
  const props = propsFixture();
  vi.mocked(props.createAction).mockResolvedValue({
    ok: false,
    error: { code: "private_view_creation_unavailable", status: 403, message: "denied" },
  });
  render(<PersonalSavedViewsControl {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Save as" }));
  const modal = within(screen.getByRole("dialog"));
  fireEvent.change(modal.getByRole("textbox", { name: "View name" }), {
    target: { value: "Private draft" },
  });
  fireEvent.click(modal.getByRole("button", { name: "Save as" }));
  expect(await modal.findByRole("alert")).toHaveTextContent(props.labels.privateUnavailable);
  expect(modal.queryByText(props.labels.failed)).not.toBeInTheDocument();
});
