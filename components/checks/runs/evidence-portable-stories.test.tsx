import * as admin from "@/components/admin/recovery/AdminRecoveryConsole.stories";
import * as summary from "@/components/checks/summaries/CheckSummaryDetails.stories";
import * as keyword from "@/components/keywords/grid/KeywordEvidence.stories";
import * as settings from "@/components/settings/notifications/NotificationPreferences.stories";
import * as legacyBell from "@/components/shell/NotificationBell.stories";
import * as bell from "@/components/shell/NotificationBellEvidence.stories";
import * as tray from "@/components/shell/OperationsTray.stories";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { composeStories } from "@storybook/react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ComponentType, ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as runs from "./CheckRunsSection.stories";
import * as projections from "./EvidenceProjectionBands.stories";
import * as workspace from "./EvidenceRunsWorkspace.stories";
import * as range from "./ExactRangeControl.stories";
import * as rank from "./RankResultMarker.stories";

vi.mock("@/lib/actions/notification-prefs", () => ({ updateNotificationPreferences: vi.fn() }));
vi.mock("@/lib/actions/run-tray", () => ({ dismissTrayRun: vi.fn() }));
vi.mock("@/lib/actions/metering-recovery", () => ({}));
vi.mock("@/lib/actions/search-insights", () => ({}));
vi.mock("@/lib/actions/rank-check-runs", () => ({}));
vi.mock("@/components/ui/toast-context", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/lib/notifications/useNotificationStream", () => ({
  useNotificationStream: (feed: unknown) => ({ feed, status: "live" }),
}));

const modules = {
  admin,
  summary,
  keyword,
  settings,
  bell,
  legacyBell,
  tray,
  runs,
  projections,
  workspace,
  range,
  rank,
};
const rawKey =
  /\b(?:shell|projectRankTracker|projectRuns|projectSettingsNotifications|instanceAdmin|shared)\.[a-zA-Z][\w.]+/;
function smoke(element: ReactElement) {
  const errors: unknown[][] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...args) => errors.push(args));
  try {
    const result = render(<TooltipProvider>{element}</TooltipProvider>);
    // Closed popovers must also exercise their translated content.
    for (const button of result.container.querySelectorAll<HTMLButtonElement>(
      'button[aria-haspopup="dialog"]',
    )) {
      if (button.getAttribute("aria-expanded") !== "true") fireEvent.click(button);
    }
    expect(document.body.textContent).not.toMatch(rawKey);
    expect(errors.flat().map(String).join("\n")).not.toMatch(
      /MISSING_MESSAGE|FORMATTING_ERROR|IntlError/,
    );
  } finally {
    cleanup();
    spy.mockRestore();
  }
}
afterEach(cleanup);
describe.each(["en", "pl", "ja", "es-ES"])("portable evidence stories: %s", (locale) => {
  for (const [group, module] of Object.entries(modules)) {
    const stories = composeStories(module as Parameters<typeof composeStories>[0], {
      initialGlobals: { locale, timeZone: "Europe/Warsaw" },
    }) as Record<string, ComponentType>;
    for (const [name, Story] of Object.entries(stories)) {
      it(`${group}/${name} renders without errors or raw message keys`, () => smoke(<Story />));
    }
  }
});
it("the smoke guard rejects a thrown render error", () => {
  function Broken(): never {
    throw new Error("planted render defect");
  }
  expect(() => smoke(<Broken />)).toThrow("planted render defect");
});
it("the smoke guard rejects a raw missing message key", () => {
  expect(() => smoke(<span>shell.notifications.plantedMissingKey</span>)).toThrow();
});
