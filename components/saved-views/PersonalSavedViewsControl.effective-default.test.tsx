import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import {
  generalPreference,
  type SetPersonalDefaultInput,
  setPersonalDefaultSchema,
} from "@/lib/project-surface-preferences/model";
import { keywordViewFixture, viewProjectId } from "@/lib/saved-views/view-test-fixture";
import shared from "@/messages/core/en/shared.json";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PersonalSavedViewsControl } from "./PersonalSavedViewsControl";
import type { PersonalSavedViewsControlProps } from "./personal-control-types";

function effectiveProps(): PersonalSavedViewsControlProps {
  const unexpected = async () => {
    throw new Error("Read-only display must not write");
  };
  return {
    activeViewId: null,
    canCreateShared: false,
    config: keywordViewFixture(),
    createAction: vi.fn(unexpected),
    deleteAction: vi.fn(unexpected),
    updateAction: vi.fn(unexpected),
    labels: shared.shared.personalViews,
    modified: false,
    onDiscard: vi.fn(),
    onRefresh: vi.fn(),
    onSelect: vi.fn(),
    preference: {
      ...generalPreference(viewProjectId, "keywords"),
      defaultTarget: null,
      notice: "unavailable_default",
      revision: 4,
    },
    projectId: viewProjectId,
    scopeKey: "effective-private-default-session",
    scopeSummary: "General scope",
    views: [],
    setDefaultAction: vi.fn(async (input: SetPersonalDefaultInput) => ({
      ok: true as const,
      value: {
        ...generalPreference(viewProjectId, "keywords"),
        defaultTarget: setPersonalDefaultSchema.parse(input).target,
        revision: 5,
      },
    })),
  };
}

describe("nullable effective default read DTO", () => {
  it("shows only neutral General/notice and performs no writes during display", () => {
    const props = effectiveProps();
    render(<PersonalSavedViewsControl {...props} />);
    expect(screen.getByRole("button", { name: props.labels.general })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(props.labels.unavailableDefault);
    expect(props.setDefaultAction).not.toHaveBeenCalled();
    expect(props.createAction).not.toHaveBeenCalled();
    expect(props.updateAction).not.toHaveBeenCalled();
    expect(props.deleteAction).not.toHaveBeenCalled();
  });

  it("writes an explicit General target using the retained revision, never the nullable read state", async () => {
    const props = effectiveProps();
    const before = structuredClone(props.preference);
    render(<PersonalSavedViewsControl {...props} />);
    fireEvent.click(screen.getByRole("button", { name: props.labels.general }));
    fireEvent.click(await screen.findByRole("menuitem", { name: props.labels.setDefault }));
    await waitFor(() =>
      expect(props.setDefaultAction).toHaveBeenCalledWith({
        expectedRevision: 4,
        projectId: viewProjectId,
        surface: "keywords",
        target: { kind: "preset", presetId: "general" },
      }),
    );
    await waitFor(() => expect(props.onRefresh).toHaveBeenCalledOnce());
    expect(props.preference).toEqual(before);
  });
});
