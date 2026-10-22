import { renderWithCompetitorsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { generalPreference } from "@/lib/project-surface-preferences/model";
import { emptyTablePresentation } from "@/lib/saved-views/presentation-model";
import { canonicalViewFixture, viewProjectId } from "@/lib/saved-views/view-test-fixture";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { CompetitorPersonalViewControl } from "./CompetitorPersonalViewControl";

const actions = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  setDefault: vi.fn(),
}));
vi.mock("@/lib/actions/saved-views", () => ({
  createSavedViewV2: actions.create,
  updateSavedViewV2: actions.update,
  deleteSavedViewV2: actions.remove,
}));
vi.mock("@/lib/project-surface-preferences/actions", () => ({
  setPersonalDefault: actions.setDefault,
}));
const config = {
  surface: "competitors" as const,
  version: 1 as const,
  scope: { device: "mobile" as const, engine: "google" as const, locationId: "krakow" },
  filters: { excludedKeywordIds: [], position: "all" as const, tag: null },
};
const view = {
  ...canonicalViewFixture(),
  surface: "competitors" as const,
  config: {
    ...config,
    version: 2 as const,
    grouped: false,
    pageSize: 100 as const,
    presentation: { ...emptyTablePresentation, sizing: { keyword: 240 } },
    sort: { field: "keyword", direction: "asc" as const },
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  actions.create.mockResolvedValue({ ok: true, value: view });
  actions.update.mockResolvedValue({ ok: true, value: { ...view, revision: 2 } });
});
function props() {
  return {
    activeViewId: null,
    config,
    projectId: viewProjectId,
    canCreateShared: false,
    modified: false,
    onDiscard: vi.fn(),
    context: {
      views: [],
      preference: generalPreference(viewProjectId, "competitors"),
      presentation: null,
      scopeKey: "user-a:project:competitors",
      privateCreation: { canCreatePrivate: true, reason: null },
    },
  };
}

function chooseViewAction(view: string, name: string) {
  fireEvent.click(screen.getByRole("button", { name: view }));
  fireEvent.click(screen.getByRole("menuitem", { name }));
}

it("lets a viewer save a personal competitor scope through V2 without shared creation", async () => {
  render(<CompetitorPersonalViewControl {...props()} />);
  chooseViewAction("General", "Save as");
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "My mobile" } });
  expect(within(dialog).getByRole("radio", { name: "Project" })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Save as" }));
  await waitFor(() =>
    expect(actions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "My mobile",
        visibility: "private",
        projectId: viewProjectId,
        config: expect.objectContaining({
          surface: "competitors",
          scope: config.scope,
          version: 2,
        }),
      }),
    ),
  );
  expect(routerMock.push).toHaveBeenCalledWith(expect.stringContaining(`view=${view.id}`));
});

it("preserves existing V2 presentation metadata when saving changed filters", async () => {
  const base = props();
  render(
    <CompetitorPersonalViewControl
      {...base}
      activeViewId={view.id}
      modified
      context={{ ...base.context, views: [view] }}
      config={{ ...config, filters: { ...config.filters, position: "top3" } }}
    />,
  );
  chooseViewAction("Service mobile", "Save changes");
  await waitFor(() =>
    expect(actions.update).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 1,
        viewId: view.id,
        config: expect.objectContaining({
          presentation: view.config.presentation,
          filters: expect.objectContaining({ position: "top3" }),
        }),
      }),
    ),
  );
});
