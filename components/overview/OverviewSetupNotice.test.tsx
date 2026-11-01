import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { OverviewSetupNotice } from "./OverviewSetupNotice";
import { overviewFixture } from "./overview-fixtures";

const mocks = vi.hoisted(() => ({ banner: vi.fn((_props: Record<string, unknown>) => null) }));
vi.mock("./OverviewNoDataTop", () => ({ NoDataBanner: mocks.banner }));
vi.mock("@/lib/actions/rank-check-preview", () => ({ getFirstCheckRunPlan: vi.fn() }));
vi.mock("@/lib/actions/rankCheck", () => ({ runCheckNow: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
it("keeps setup guidance without granting provider or run permissions to a viewer", () => {
  renderToStaticMarkup(
    <OverviewSetupNotice
      overview={{ ...overviewFixture, state: "empty", serpProviderState: "missing" }}
      checkHealth={{ budget: { exhausted: false }, runningCount: 0 } as never}
      canCreateKeyword={false}
      canManageProviders={false}
      canRunChecks={false}
    />,
  );
  expect(mocks.banner.mock.calls[0][0]).toMatchObject({
    state: "missing",
    canCreateKeyword: false,
    canManageProviders: false,
    canRunChecks: false,
  });
});
it("never turns unknown health into a ready first check", () => {
  renderToStaticMarkup(
    <OverviewSetupNotice
      overview={{ ...overviewFixture, state: "no-data" }}
      checkHealth={null}
      canCreateKeyword
      canManageProviders
      canRunChecks
    />,
  );
  expect(mocks.banner).not.toHaveBeenCalled();
});
