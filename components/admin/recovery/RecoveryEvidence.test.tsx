import { renderWithInstanceAdminMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { evidenceRecoveryFixture } from "@/lib/metering/recovery/evidence-view-fixture";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecoveryEvidence } from "./RecoveryEvidence";
import { RecoveryPartialEvidence } from "./RecoveryPartialEvidence";
import { RecoveryTable } from "./RecoveryTable";

describe("UI-8 admin evidence", () => {
  it.each([
    ["under_review", "Under review"],
    ["recovered", "Recovered"],
    ["partial", "Partial"],
    ["provider_error", "Provider error"],
    ["missing", "Missing"],
  ] as const)("shows %s independently from unknown cost", (result, label) => {
    const page = evidenceRecoveryFixture(result, "unknown");
    render(<RecoveryEvidence value={page.rows[0].evidence} column="classification" />);
    expect(screen.getByText(`Result: ${label}`)).toBeVisible();
    expect(screen.getByText("Cost: Unknown")).toBeVisible();
  });
  it("shows all new columns, UTC open timestamp and age, lookup timing, reason and incident link", () => {
    const page = evidenceRecoveryFixture("recovered", "conflict");
    render(
      <RecoveryTable
        rows={page.rows}
        selected={[]}
        busy={false}
        onDetails={() => {}}
        onSelect={() => {}}
      />,
    );
    for (const name of [
      "Evidence classification",
      "Acceptance / recovery",
      "Incident",
      "Lookup attempts",
    ])
      expect(screen.getByRole("columnheader", { name })).toBeVisible();
    expect(screen.getByText("Cost: Conflict")).toBeVisible();
    expect(screen.getByText("Cost: Conflict").closest('[role="row"]')).toHaveClass("h-auto!");
    expect(screen.getAllByText("Oct 24, 2026, 6:00:00 AM UTC")).toHaveLength(2);
    expect(screen.getByText("60 min open")).toBeVisible();
    expect(screen.getByRole("link", { name: "Incident" })).toHaveAttribute(
      "href",
      page.rows[0].evidence?.incident?.href,
    );
    expect(screen.getByText("Oct 24, 2026, 7:00:00 AM UTC")).toBeVisible();
    expect(screen.getByText("history_not_ready")).toBeVisible();
    expect(screen.getByText("Unconfirmed")).toBeVisible();
    expect(screen.getByText("Operator review")).toBeVisible();
  });
  it("lists partial and unresolved evidence without a restore or selection action", () => {
    render(<RecoveryPartialEvidence rows={evidenceRecoveryFixture().partialEvidence ?? []} />);
    const list = screen.getByRole("region", { name: "Partial and unresolved evidence" });
    expect(within(list).getByText("Partial")).toBeVisible();
    expect(within(list).getByText("Unresolved")).toBeVisible();
    expect(within(list).queryByRole("checkbox")).toBeNull();
    expect(within(list).queryByRole("button", { name: /restore/i })).toBeNull();
  });
});
