import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import {
  renderWithProjectRunsMessages as render,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import schedulesMessages from "@/messages/core/en/project-runs-schedules.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScheduleEditorMembers } from "./ScheduleEditorMembers";

const polishScheduleMessages = mergeMessageCatalogs(sharedMessages, {
  projectRuns: {
    ...schedulesMessages.projectRuns,
    schedules: {
      ...schedulesMessages.projectRuns.schedules,
      editor: {
        ...schedulesMessages.projectRuns.schedules.editor,
        moveCombined: "{scheduled} oraz {manual}",
        moveManual: "{count, plural, one {# slowo reczne} other {# slowa reczne}}",
        moveScheduled: "{count, plural, one {# slowo zaplanowane} other {# slowa zaplanowane}}",
        moveSummary: "Zapisywanie przenosi {summary} do {name}.",
      },
    },
  },
});

describe("ScheduleEditorMembers", () => {
  it("renders stored and pending members in the existing framed surface", () => {
    render(
      <ScheduleEditorMembers
        memberCount={2}
        onOpenDrawer={vi.fn()}
        pendingMembers={[
          {
            name: "static site generator",
            pending: true,
            publicId: "kw_pending",
            sourceName: "Daily 06:00",
            targetCount: 2,
          },
        ]}
        scheduleName="Commercial daily"
        storedMembers={[{ name: "api first cms", publicId: "kw_stored", targetCount: 3 }]}
      />,
    );

    const table = screen.getByRole("table", { name: "Schedule members" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Keyword", "Checks", "Pending"]);
    expect(within(table).getByText("api first cms")).toBeVisible();
    expect(within(table).getByText("Moves from Daily 06:00")).toBeVisible();
    expect(
      screen.getByText("Saving moves 1 keyword from other schedules into Commercial daily."),
    ).toBeVisible();
  });

  it("preserves the empty state and opens the keyword drawer", () => {
    const onOpenDrawer = vi.fn();
    render(
      <ScheduleEditorMembers
        memberCount={0}
        onOpenDrawer={onOpenDrawer}
        pendingMembers={[]}
        scheduleName="Commercial daily"
        storedMembers={[]}
      />,
    );

    expect(screen.queryByRole("table", { name: "Schedule members" })).not.toBeInTheDocument();
    expect(screen.getByText(/No keywords assigned.*will not plan new checks/)).toBeVisible();
    screen.getByRole("button", { name: "Add keywords" }).click();
    expect(onOpenDrawer).toHaveBeenCalledOnce();
  });

  it("joins mixed pending-member consequences through the supplied locale message", () => {
    renderWithFeatureMessages(
      <ScheduleEditorMembers
        memberCount={2}
        onOpenDrawer={vi.fn()}
        pendingMembers={[
          { name: "one", publicId: "kw_one", sourceName: "Daily", targetCount: 1 },
          { name: "two", publicId: "kw_two", targetCount: 1 },
        ]}
        scheduleName="Codzienny"
        storedMembers={[]}
      />,
      { locale: "pl", messages: polishScheduleMessages },
    );

    expect(
      screen.getByText(
        "Zapisywanie przenosi 1 slowo zaplanowane oraz 1 slowo reczne do Codzienny.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/ and /)).not.toBeInTheDocument();
  });
});
