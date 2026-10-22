import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalSubjectControl } from "./LocalSubjectControl";
import { localStoryContext, localStoryPreference } from "./test-fixtures";

const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
beforeEach(() => {
  setNavigationState({
    pathname: "/app/prj_example/dashboard",
    searchParams: new URLSearchParams("tag=kept&dashboardView=local"),
  });
});
vi.mock("@/lib/project-surface-preferences/dashboard-actions", () => ({
  saveDashboardLocalSelection: mocks.save,
}));
vi.mock("@/components/ui/MenuSelect", () => ({
  MenuSelect: ({
    options,
    value,
    onChange,
    ariaLabel,
  }: {
    options: { value: string; label: string }[];
    value: string;
    onChange: (value: string) => void;
    ariaLabel: string;
  }) => (
    <select aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option value={option.value} key={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

describe("explicit Local display controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.save.mockResolvedValue({ ok: true, value: localStoryPreference });
  });
  it("changes only the URL and preserves filters, with no automatic persistence", () => {
    render(<LocalSubjectControl local={localStoryContext} preference={localStoryPreference} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    const url = new URL(routerMock.replace.mock.calls[0][0], "https://example.test");
    expect(url.searchParams.get("tag")).toBe("kept");
    expect(url.searchParams.has("dashboardLocalSubject")).toBe(true);
    expect(url.searchParams.get("dashboardLocalSubject")).toBe("");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("saves only explicit selection and own revision, without user or schedule input", async () => {
    render(<LocalSubjectControl local={localStoryContext} preference={localStoryPreference} />);
    fireEvent.click(screen.getByRole("button", { name: "remember" }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({
        projectId: localStoryPreference.projectId,
        expectedRevision: 2,
        selection: localStoryContext.selection,
      }),
    );
    expect(routerMock.refresh).toHaveBeenCalledOnce();
  });
  it("a stale CAS response stays a conflict and never silently retries", async () => {
    mocks.save.mockResolvedValue({ ok: false, error: { status: 409 } });
    render(<LocalSubjectControl local={localStoryContext} preference={localStoryPreference} />);
    fireEvent.click(screen.getByRole("button", { name: "remember" }));
    expect(await screen.findByText("conflict")).toBeVisible();
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
  it("missing Local requires selection and never defaults to the only available choice", () => {
    render(
      <LocalSubjectControl
        local={{ ...localStoryContext, state: "missing", selection: null }}
        preference={localStoryPreference}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "remember" })).toBeNull();
    expect(screen.getByText("state.missing")).toBeVisible();
  });
});
