import { renderWithInstanceAdminMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { AdminInstanceUsage } from "./AdminInstanceUsage";
import { formatRecordedUsd } from "./admin-usage-money";
import { instanceUsageFixture } from "./instance-usage-test-fixture";

beforeEach(() => setNavigationState({ pathname: "/app/admin/administration" }));

test("shows all-history instance totals, retained costs and unknown costs separately", () => {
  render(<AdminInstanceUsage report={instanceUsageFixture} period="all" projects />);
  expect(screen.getByRole("button", { name: "Usage period" })).toHaveTextContent("All history");
  expect(screen.getByText("$6.256660")).toBeInTheDocument();
  const table = screen.getByRole("table", { name: "Top instance consumption" });
  expect(within(table).getByText("$6.000000")).toBeInTheDocument();
  expect(within(table).getByText("Unknown provider")).toBeInTheDocument();
  expect(within(table).getByText("Unattributed project")).toBeInTheDocument();
  expect(screen.getByText("31")).toBeInTheDocument();
});

test("does not replace unknown-only or unavailable costs with zero", () => {
  const report = {
    ...instanceUsageFixture,
    totals: { operations: 12, recordedOperations: 0, unknownOperations: 12, costUsdUnits: null },
    providers: [],
    topProjects: [],
  };
  const view = render(<AdminInstanceUsage report={report} period="all" />);
  expect(screen.getByText("Unknown")).toBeInTheDocument();
  expect(screen.queryByText("$0.000000")).not.toBeInTheDocument();
  view.unmount();
  render(<AdminInstanceUsage report={null} period="all" />);
  expect(screen.getByRole("status")).toHaveTextContent("unavailable");
  expect(screen.queryByText("$0.000000")).not.toBeInTheDocument();
});

test("changes the server report period without changing other query filters", () => {
  setNavigationState({ pathname: "/app/admin/administration", searchParams: { tab: "usage" } });
  render(<AdminInstanceUsage report={instanceUsageFixture} period="all" />);
  fireEvent.click(screen.getByRole("button", { name: "Usage period" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Current month (UTC)" }));
  expect(routerMock.replace).toHaveBeenCalledWith(
    "/app/admin/administration?tab=usage&usagePeriod=month",
    { scroll: false },
  );
});

test("keeps monetary precision above the JavaScript safe-integer limit", () => {
  expect(formatRecordedUsd("9007199254740993", "en")).toBe("$9,007,199,254.740993");
});
