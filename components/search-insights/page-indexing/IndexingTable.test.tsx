import "./virtual-table-test-setup";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import shared from "@/messages/core/en/shared.json";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { IndexingTable } from "./IndexingTable";

it("keeps the shared header separator above its empty body", () => {
  render(
    <FeatureMessagesProvider locale="en" timeZone="UTC" messages={shared}>
      <IndexingTable
        id="empty-indexing"
        label="URLs"
        columns={[{ id: "url", header: "URL" }]}
        rows={[]}
        emptyState={<p>No URLs match these filters.</p>}
      />
    </FeatureMessagesProvider>,
  );
  const header = screen.getByRole("columnheader", { name: "URL" }).closest('[role="row"]');
  expect(header).toHaveClass("border-y");
  expect(header).not.toHaveClass("border-b-0");
  expect(screen.getByText("No URLs match these filters.").closest('[role="cell"]')).not.toBeNull();
});
