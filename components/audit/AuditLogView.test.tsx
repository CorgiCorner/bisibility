import { setNavigationState } from "@/tests/next-navigation";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AuditLogView } from "./AuditLogView";

beforeEach(() => {
  setNavigationState({ pathname: "/app/settings/audit" });
});

describe("AuditLogView", () => {
  it("states that client-side filters only search the capped event set", () => {
    render(
      <AuditLogView
        dateRange="30d"
        entries={[]}
        entryLimit={200}
        retentionDays={365}
        truncated={false}
      />,
    );

    expect(
      screen.getByText(
        "Adjust the filters to search up to the 200 most recent events in this date range.",
      ),
    ).toBeVisible();
    expect(screen.getByText(/filters search up to 200 most recent events/i)).toBeVisible();
    expect(screen.getByText("Append-only / retained 365 days")).toBeVisible();
    expect(screen.queryByText(/worm/i)).not.toBeInTheDocument();

    const search = screen.getByPlaceholderText("Search actor, event, resource ID…");
    const card = search.closest(".MuiCard-root");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByRole("grid", { name: "Audit log" })).toBeVisible();
  });
});
