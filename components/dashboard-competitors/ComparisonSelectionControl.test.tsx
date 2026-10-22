import {
  comparisonConfig,
  comparisonProject,
  comparisonSelection,
} from "@/lib/dashboard-competitors/fixture";
import type { DashboardComparisonContext } from "@/lib/dashboard-competitors/model";
import type { DashboardSurfacePreference } from "@/lib/project-surface-preferences/dashboard-model";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ComparisonSelectionControl } from "./ComparisonSelectionControl";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  read: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));
beforeEach(() => {
  setNavigationState({
    pathname: "/app/project/dashboard",
    searchParams: new URLSearchParams("range=90d&tag=core&dashboardView=competitors"),
  });
});
vi.mock("@/lib/project-surface-preferences/dashboard-actions", () => ({
  saveDashboardComparisonSelection: mocks.save,
  readDashboardPreference: mocks.read,
}));
const preference: DashboardSurfacePreference = {
  projectId: comparisonProject.publicId,
  revision: 7,
  defaultPreset: "general",
  presentation: { schemaVersion: 1, layouts: {}, competitorSelection: null },
};
const comparison: DashboardComparisonContext = {
  state: "ready",
  selection: comparisonSelection,
  report: null,
  choices: [
    {
      selection: comparisonSelection,
      name: "Krakow mobile",
      scope: comparisonConfig().scope,
      tag: null,
      locationLabel: "Krakow",
      languageLabel: "Polish",
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockImplementation(async ({ selection }) => ({
    ok: true,
    value: {
      ...preference,
      revision: 8,
      presentation: { ...preference.presentation, competitorSelection: selection },
    },
  }));
});
it("mounts with owned controls without a write and clears only explicit URL selection, preserving the range/tag", async () => {
  render(<ComparisonSelectionControl comparison={comparison} preference={preference} />);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "selection" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "choose" }));
  const url = new URL(routerMock.replace.mock.calls[0][0], "https://example.test");
  expect(url.searchParams.get("dashboardCompetitorView")).toBe("");
  expect(url.searchParams.get("range")).toBe("90d");
  expect(url.searchParams.get("tag")).toBe("core");
  expect(mocks.save).not.toHaveBeenCalled();
});
it("selects exact revision/device/market explicitly instead of a first-match default", async () => {
  render(
    <ComparisonSelectionControl
      comparison={{ ...comparison, state: "missing", selection: null }}
      preference={preference}
    />,
  );
  expect(screen.queryByRole("button", { name: "remember" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "selection" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /Krakow mobile/ }));
  const url = new URL(routerMock.replace.mock.calls[0][0], "https://example.test");
  expect(JSON.parse(url.searchParams.get("dashboardCompetitorView") ?? "null")).toEqual(
    comparisonSelection,
  );
  expect(url.searchParams.get("device")).toBe("mobile");
  expect(url.searchParams.get("market")).toBe("loc");
  expect(mocks.save).not.toHaveBeenCalled();
});
it("saves only the project/reference/CAS and never changes default or passes actor authority", async () => {
  render(<ComparisonSelectionControl comparison={comparison} preference={preference} />);
  fireEvent.click(screen.getByRole("button", { name: "remember" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith({
      projectId: comparisonProject.publicId,
      expectedRevision: 7,
      selection: comparisonSelection,
    }),
  );
  expect(routerMock.refresh).toHaveBeenCalledOnce();
});
it("reloads a newer compatible CAS only on explicit review and requires a separate user save", async () => {
  mocks.save.mockResolvedValueOnce({ ok: false, error: { status: 409 } });
  mocks.read.mockResolvedValue({ ok: true, value: { ...preference, revision: 9 } });
  render(<ComparisonSelectionControl comparison={comparison} preference={preference} />);
  fireEvent.click(screen.getByRole("button", { name: "remember" }));
  const reload = await screen.findByRole("button", { name: "reloadRevision" });
  await waitFor(() => expect(reload).toBeEnabled());
  fireEvent.click(reload);
  await screen.findByText('reviewRevision:{"revision":"9"}');
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(routerMock.refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "remember" }));
  await waitFor(() => expect(mocks.save.mock.calls[1][0].expectedRevision).toBe(9));
});
it.each(["foreign", "same", "unsupported"])(
  "refuses %s reload without a write or stale-revision replay",
  async (kind) => {
    mocks.save.mockResolvedValue({ ok: false, error: { status: 409 } });
    mocks.read.mockResolvedValue({
      ok: true,
      value: {
        ...preference,
        revision: kind === "same" ? 7 : 9,
        ...(kind === "foreign" ? { projectId: "foreign" } : {}),
        ...(kind === "unsupported"
          ? { notice: { kind: "unsupported_version", scopeUnavailable: true } }
          : {}),
      },
    });
    render(<ComparisonSelectionControl comparison={comparison} preference={preference} />);
    fireEvent.click(screen.getByRole("button", { name: "remember" }));
    const reload = await screen.findByRole("button", { name: "reloadRevision" });
    await waitFor(() => expect(reload).toBeEnabled());
    fireEvent.click(reload);
    await screen.findByText("reloadUnavailable");
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  },
);

it("opens from the keyboard and returns trigger focus on Escape without persistence", async () => {
  const user = userEvent.setup();
  render(<ComparisonSelectionControl comparison={comparison} preference={preference} />);
  const trigger = screen.getByRole("button", { name: "selection" });
  trigger.focus();
  await user.keyboard("{Enter}");
  expect(await screen.findByRole("textbox")).toHaveFocus();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(mocks.save).not.toHaveBeenCalled();
});

it.each(["missing", "unavailable"] as const)(
  "offers one real setup action for %s with no comparison choices and never reads or saves on mount",
  (state) => {
    render(
      <ComparisonSelectionControl
        comparison={{ ...comparison, state, choices: [], selection: null }}
        preference={preference}
        standalone
      />,
    );
    expect(screen.getByRole("link", { name: "configureComparison" })).toHaveAttribute(
      "href",
      `/app/${comparisonProject.publicId}/competitors`,
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "selection" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "remember" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "clear" })).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(
      screen.getByText(state === "missing" ? "emptyDescription" : "state.unavailable"),
    ).toBeInTheDocument();
  },
);
it("hides an already remembered save while retaining explicit Clear", async () => {
  render(
    <ComparisonSelectionControl
      comparison={comparison}
      preference={{
        ...preference,
        presentation: { ...preference.presentation, competitorSelection: comparisonSelection },
      }}
    />,
  );
  expect(screen.queryByRole("button", { name: "remember" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "clear" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith({
      projectId: comparisonProject.publicId,
      expectedRevision: 7,
      selection: null,
    }),
  );
  expect(screen.queryByRole("button", { name: "clear" })).not.toBeInTheDocument();
});
it("hides persistence actions on an unsupported preference while preserving saved choice navigation", () => {
  render(
    <ComparisonSelectionControl
      comparison={comparison}
      preference={{
        ...preference,
        notice: { kind: "unsupported_version", scopeUnavailable: true },
      }}
    />,
  );
  expect(screen.getByRole("button", { name: "selection" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "remember" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "clear" })).not.toBeInTheDocument();
});
it.each(["unavailable", "capacity", "invalid", "missing"] as const)(
  "retains explicit Clear for a remembered %s reference without choices",
  async (state) => {
    render(
      <ComparisonSelectionControl
        standalone
        comparison={{ ...comparison, state, choices: [], selection: null }}
        preference={{
          ...preference,
          presentation: { ...preference.presentation, competitorSelection: comparisonSelection },
        }}
      />,
    );
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "clear" }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({
        projectId: comparisonProject.publicId,
        expectedRevision: 7,
        selection: null,
      }),
    );
    await waitFor(() => expect(screen.getByText("cleared")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "clear" })).not.toBeInTheDocument();
  },
);
