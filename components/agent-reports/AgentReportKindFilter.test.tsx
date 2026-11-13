import { renderWithSharedMessages } from "@/i18n/test-support/render-with-feature-messages";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { AgentReportKindFilter } from "./AgentReportKindFilter";

it("routes the kind filter and displays server-provided selection on navigation", async () => {
  setNavigationState({ pathname: "/app/prj_example/agent-reports" });
  const props = {
    label: "Report kind",
    labels: { all: "All reports", challenge_report: "Challenge report" },
  };
  const { rerender } = renderWithSharedMessages(<AgentReportKindFilter {...props} value="all" />);
  await userEvent.click(screen.getByRole("button"));
  await userEvent.click(screen.getByRole("menuitem", { name: "Challenge report" }));
  expect(routerMock.replace).toHaveBeenCalledWith(
    "/app/prj_example/agent-reports?kind=challenge_report",
  );
  rerender(<AgentReportKindFilter {...props} value="challenge_report" />);
  expect(screen.getByRole("button")).toHaveTextContent("Challenge report");
  rerender(<AgentReportKindFilter {...props} value="all" />);
  expect(screen.getByRole("button")).toHaveTextContent("All reports");
});
