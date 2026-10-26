import "./virtual-table-test-setup";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import messages from "@/messages/core/en/project-search-insights.json";
import shared from "@/messages/core/en/shared.json";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { IndexingStatus } from "./IndexingStatus";
import { indexingData } from "./indexing.test-support";

it("keeps inspection settings and the primary action visible while details start collapsed", () => {
  const inspect = vi.fn();
  render(
    <FeatureMessagesProvider locale="en" timeZone="UTC" messages={{ ...shared, ...messages }}>
      <IndexingStatus data={indexingData} projectId="prj_example" canInspect onInspect={inspect} />
    </FeatureMessagesProvider>,
  );
  expect(screen.getByText(indexingData.report.property)).toBeVisible();
  expect(screen.getByRole("link", { name: "Inspection settings" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Inspect URL" }));
  expect(inspect).toHaveBeenCalledOnce();

  const summary = screen.getByText("Inspection details").closest("summary");
  const details = summary?.closest("details");
  expect(details).not.toHaveAttribute("open");
  expect(screen.getByText("Fixed daily limit")).not.toBeVisible();
  expect(screen.getByText(/50 checks/)).not.toBeVisible();
  expect(screen.getByText(/Oldest result/)).not.toBeVisible();

  if (!summary) throw new Error("Missing inspection details toggle");
  fireEvent.click(summary);
  expect(details).toHaveAttribute("open");
  expect(screen.getByText("Fixed daily limit")).toBeVisible();
  expect(screen.getByText(/50 checks/)).toBeVisible();
  expect(screen.getByText(/Oldest result/)).toBeVisible();
  expect(screen.getByText(/midnight Pacific/)).toBeVisible();
  expect(inspect).toHaveBeenCalledOnce();
});

it("keeps an exhausted-quota warning visible outside the collapsed details", () => {
  render(
    <FeatureMessagesProvider locale="en" timeZone="UTC" messages={{ ...shared, ...messages }}>
      <IndexingStatus
        data={{ ...indexingData, allowance: { limit: 50, used: 50, remaining: 0 } }}
        projectId="prj_example"
        canInspect
        onInspect={() => undefined}
      />
    </FeatureMessagesProvider>,
  );
  expect(screen.getByText(/Checks can resume after/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Inspect URL" })).toBeDisabled();
});
