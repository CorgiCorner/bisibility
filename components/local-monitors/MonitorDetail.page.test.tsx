import LocalMonitorPage from "@/app/(regional)/app/(workspace)/[project]/settings/(sections)/business-locations/monitors/[monitor]/page";
import sharedMessages from "@/messages/core/en/shared.json";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { monitorChoiceFixture, monitorUiFixture } from "./monitor-ui.test-fixture";

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  locale: vi.fn(),
  messages: vi.fn(),
  monitor: vi.fn(),
  choices: vi.fn(),
  results: vi.fn(),
  launch: vi.fn(),
  recurring: vi.fn(),
}));

vi.mock("@/components/settings/shell/SettingsShell", () => ({
  SettingsShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.access }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.locale,
}));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.messages }));
vi.mock("@/lib/local-monitor-store/read", () => ({ readLocalMonitor: mocks.monitor }));
vi.mock("@/lib/local-monitors/setup-read", () => ({ readMonitorSetupChoices: mocks.choices }));
vi.mock("@/lib/local-monitor-results/page-read", () => ({ readLocalResultsPage: mocks.results }));
vi.mock("@/lib/local-monitors/session-actions", () => ({
  saveMonitorAction: vi.fn(),
  searchMonitorChoicesAction: vi.fn(),
  readMonitorHistoryAction: vi.fn(),
}));
vi.mock("@/lib/local-monitor-launch/session-actions", () => ({
  readMonitorLaunchAction: mocks.launch,
  previewMonitorLaunchAction: vi.fn(),
  launchMonitorAction: vi.fn(),
}));
vi.mock("@/lib/local-monitor-recurring/session-actions", () => ({
  readRecurringMonitorAction: mocks.recurring,
  previewRecurringMonitorAction: vi.fn(),
  approveRecurringMonitorAction: vi.fn(),
  pauseRecurringMonitorAction: vi.fn(),
}));
vi.mock("@/lib/local-monitor-results/session-actions", () => ({
  readLocalRunHistoryAction: vi.fn(),
  exportLocalRunResultAction: vi.fn(),
  readLocalPointListingsAction: vi.fn(),
  readLocalPointHistoryAction: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ actor: { id: "user_1" }, project: { publicId: projectId } });
  mocks.locale.mockResolvedValue({ locale: "en", timeZone: "UTC" });
  mocks.messages.mockResolvedValue(sharedMessages);
  mocks.monitor.mockResolvedValue({ ...monitorUiFixture, version: 2 });
  mocks.choices.mockResolvedValue(monitorChoiceFixture);
  mocks.results.mockResolvedValue({
    runHistory: null,
    runResult: null,
    resultUnavailable: false,
  });
  mocks.launch.mockResolvedValue({
    kind: "ready",
    state: { connections: [], labels: [], intent: null, run: null },
  });
  mocks.recurring.mockResolvedValue({
    enabled: false,
    mode: "manual",
    approval: null,
    schedules: [],
    connections: [],
    choicesTruncated: false,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderPage() {
  const page = await LocalMonitorPage({
    params: Promise.resolve({ project: projectId, monitor: monitorUiFixture.id }),
    searchParams: Promise.resolve({}),
  });
  render(page);
  await waitFor(() => {
    expect(mocks.launch).toHaveBeenCalledWith({ projectId, monitorId: monitorUiFixture.id });
    expect(mocks.recurring).toHaveBeenCalledWith(projectId, monitorUiFixture.id);
  });
}

describe("local monitor detail page", () => {
  it("renders the real detail subtree with its query context", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(monitorUiFixture.name);
    expect(screen.getByRole("button", { name: "Edit monitor" })).toBeEnabled();
  });

  it("keeps launch and history keys distinct when version equals revision", async () => {
    mocks.monitor.mockResolvedValue(monitorUiFixture);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await renderPage();
    expect(errors.mock.calls.filter((args) => String(args[0]).includes("same key"))).toEqual([]);
  });

  it("keeps the edit form key distinct from manual launch", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole("button", { name: "Edit monitor" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(errors.mock.calls.filter((args) => String(args[0]).includes("same key"))).toEqual([]);
  });
});
