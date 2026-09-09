import { readFileSync } from "node:fs";
import {
  resolveSetupProgress,
  type SetupContext,
  type SetupStepState,
} from "@/lib/getting-started/setup-steps";
import { routerMock } from "@/tests/next-navigation";
import { composeStories } from "@storybook/react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmCompetitorsStep } from "./ConfirmCompetitorsStep";
import * as stories from "./ConfirmCompetitorsStep.stories";

const { Ready: ReadyStory } = composeStories(stories);

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const readyBody = "Choose competitors to track. You can change this later in Settings.";
const skippedBody =
  "Skipped. Nothing is tracked as a competitor, and share of voice stays off until you confirm a set.";

function context(overrides: Partial<SetupContext> = {}): SetupContext {
  return {
    completedCheckCount: 0,
    competitorSetupOutcome: null,
    competitorSuggestions: [],
    inFlightBatch: null,
    keywordCount: 1,
    keywordIds: ["kw_abcdefghijklmnopqrstuvwx"],
    project: { exists: true, name: "Example project", publicRef: projectId },
    providerExists: true,
    schedule: { mode: "manual" },
    ...overrides,
  };
}

function competitorState(ctx: SetupContext): SetupStepState {
  const step = resolveSetupProgress(ctx).steps.find(
    ({ definition }) => definition.id === "confirm_competitors",
  );
  if (!step) throw new Error("Missing competitor confirmation step.");
  return step.state;
}

const suggestions = [
  { bestPosition: 3, domain: "first.example.org", of: 12, seenOn: 9 },
  { bestPosition: 4, domain: "second.example.org", of: 12, seenOn: 6 },
];

function actions() {
  return {
    addManualCompetitor: vi.fn().mockResolvedValue({}),
    confirmSuggestedCompetitor: vi.fn().mockResolvedValue({}),
    dismissCompetitorSuggestion: vi.fn().mockResolvedValue({}),
    skipCompetitorSetup: vi.fn().mockResolvedValue({ outcome: "skipped" }),
  };
}

describe("ConfirmCompetitorsStep", () => {
  it.each([{ items: [] }, { items: suggestions }])(
    "keeps the expanded step to two actions and opens editing outside it",
    async ({ items }) => {
      const user = userEvent.setup();
      const { container } = render(
        <ConfirmCompetitorsStep
          actions={actions()}
          projectId={projectId}
          state={{ family: "ready" }}
          suggestions={items}
        />,
      );
      expect(within(container).getAllByRole("button")).toHaveLength(2);
      expect(within(container).queryByRole("checkbox")).toBeNull();
      expect(within(container).queryByRole("textbox")).toBeNull();
      const trigger = screen.getByRole("button", {
        name: items.length ? "Review competitors" : "Add your own",
      });
      await user.click(trigger);
      const dialog = screen.getByRole("dialog");
      expect(container).not.toContainElement(dialog);
      expect(
        within(dialog).getByRole(items.length ? "checkbox" : "textbox", {
          name: items.length ? "first.example.org" : "Domain",
        }),
      ).toBeVisible();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(trigger).toHaveFocus();
    },
  );

  it("separates weak branded evidence and platforms from suggested competitors", async () => {
    const handlers = actions();
    render(
      <ConfirmCompetitorsStep
        actions={handlers}
        projectId={projectId}
        state={{ family: "ready" }}
        suggestions={[
          {
            domain: "rival.org",
            bestPosition: 5,
            seenOn: 2,
            of: 3,
            nonBrandSeenOn: 2,
            kind: "competitor",
          },
          {
            domain: "github.com",
            bestPosition: 2,
            seenOn: 1,
            of: 3,
            nonBrandSeenOn: 0,
            kind: "platform",
          },
          {
            domain: "weak.org",
            bestPosition: 3,
            seenOn: 1,
            of: 3,
            nonBrandSeenOn: 0,
            kind: "other",
          },
        ]}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Review competitors" }));
    expect(
      within(screen.getByRole("region", { name: "Suggested competitors" })).getByRole("checkbox", {
        name: "rival.org",
      }),
    ).not.toBeChecked();
    const other = within(screen.getByRole("region", { name: "Other domains in results" }));
    expect(other.getByRole("checkbox", { name: "github.com" })).not.toBeChecked();
    expect(other.getByRole("checkbox", { name: "weak.org" })).not.toBeChecked();
    expect(handlers.confirmSuggestedCompetitor).not.toHaveBeenCalled();
  });

  it("keeps the zero-check fixture blocked without competitor write controls", () => {
    const calls = actions();

    render(
      <ConfirmCompetitorsStep
        actions={calls}
        projectId={projectId}
        state={competitorState(context())}
        suggestions={[]}
      />,
    );

    expect(
      screen.getByText(
        "Suggestions use your completed rank checks. This step opens after your first check.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /track|confirm|remove|add your own|skip/i }),
    ).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(calls.confirmSuggestedCompetitor).not.toHaveBeenCalled();
    expect(calls.dismissCompetitorSuggestion).not.toHaveBeenCalled();
    expect(calls.addManualCompetitor).not.toHaveBeenCalled();
    expect(calls.skipCompetitorSetup).not.toHaveBeenCalled();
  });

  it("tracks selected server-supplied suggestions with their displayed identities", async () => {
    const calls = actions();
    const user = userEvent.setup();
    render(
      <ConfirmCompetitorsStep
        actions={calls}
        projectId={projectId}
        state={competitorState(
          context({ completedCheckCount: 1, competitorSuggestions: suggestions }),
        )}
        suggestions={suggestions}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Review competitors" }));
    expect(screen.getByText("seen on 9 of 12 keywords / best #3")).toBeVisible();
    expect(screen.getByRole("button", { name: "Track selected" })).toBeDisabled();
    expect(screen.queryByText(/^Confirmed\./)).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "first.example.org" }));
    await user.click(screen.getByRole("checkbox", { name: "second.example.org" }));
    await user.click(screen.getByRole("button", { name: "Track 2 competitors" }));

    expect(calls.confirmSuggestedCompetitor).toHaveBeenNthCalledWith(1, {
      domain: "first.example.org",
      projectId,
    });
    expect(calls.confirmSuggestedCompetitor).toHaveBeenNthCalledWith(2, {
      domain: "second.example.org",
      projectId,
    });
    expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull();
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledOnce());
  });

  it("dismisses a suggestion and adds a valid manual domain with aliases", async () => {
    const calls = actions();
    const user = userEvent.setup();
    render(
      <ConfirmCompetitorsStep
        actions={calls}
        projectId={projectId}
        state={competitorState(
          context({ completedCheckCount: 1, competitorSuggestions: suggestions }),
        )}
        suggestions={suggestions}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Review competitors" }));
    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    expect(calls.dismissCompetitorSuggestion).toHaveBeenCalledWith({
      domain: "first.example.org",
      projectId,
    });
    await user.click(screen.getByRole("button", { name: "Add your own" }));
    expect(
      screen.getByText("Other brand names to match in citations, separated by commas."),
    ).toBeVisible();
    await user.type(screen.getByRole("textbox", { name: "Domain" }), "manual.example.org");
    await user.type(screen.getByRole("textbox", { name: /^Brand aliases/ }), "Manual, Manual CMS");
    await user.click(screen.getByRole("button", { name: "Add competitor" }));
    expect(calls.addManualCompetitor).toHaveBeenCalledWith({
      aliases: ["Manual", "Manual CMS"],
      domain: "manual.example.org",
      projectId,
    });
  });

  it("prevents a skipped outcome after a manual competitor is added", async () => {
    const calls = actions();
    const user = userEvent.setup();
    render(
      <ConfirmCompetitorsStep
        actions={calls}
        projectId={projectId}
        state={competitorState(context({ completedCheckCount: 1 }))}
        suggestions={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add your own" }));
    await user.type(screen.getByRole("textbox", { name: "Domain" }), "manual.example.org");
    await user.click(screen.getByRole("button", { name: "Add competitor" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull());

    expect(calls.skipCompetitorSetup).not.toHaveBeenCalled();
    expect(screen.queryByText(skippedBody)).toBeNull();
  });

  it("shows the confirmed server outcome after a manual add and a fresh render", async () => {
    const calls = actions();
    const user = userEvent.setup();
    const { unmount } = render(
      <ConfirmCompetitorsStep
        actions={calls}
        projectId={projectId}
        state={competitorState(context({ completedCheckCount: 1 }))}
        suggestions={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add your own" }));
    await user.type(screen.getByRole("textbox", { name: "Domain" }), "manual.example.org");
    await user.click(screen.getByRole("button", { name: "Add competitor" }));

    await waitFor(() => expect(screen.getByText(/^Confirmed\./)).toBeVisible());
    expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull();
    expect(calls.skipCompetitorSetup).not.toHaveBeenCalled();

    unmount();
    render(
      <ConfirmCompetitorsStep
        actions={calls}
        projectId={projectId}
        state={competitorState(
          context({ completedCheckCount: 1, competitorSetupOutcome: "confirmed" }),
        )}
        suggestions={[]}
      />,
    );

    expect(screen.getByText(/^Confirmed\./)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull();
  });

  it("keeps the step ready and without completed copy after a partial bulk failure", async () => {
    const calls = actions();
    calls.confirmSuggestedCompetitor.mockImplementation(({ domain }: { domain: string }) =>
      domain === "second.example.org" ? Promise.reject(new Error("Rejected")) : Promise.resolve({}),
    );
    const user = userEvent.setup();
    render(
      <ConfirmCompetitorsStep
        actions={calls}
        projectId={projectId}
        state={competitorState(
          context({ completedCheckCount: 1, competitorSuggestions: suggestions }),
        )}
        suggestions={suggestions}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Review competitors" }));
    await user.click(screen.getByRole("checkbox", { name: "first.example.org" }));
    await user.click(screen.getByRole("checkbox", { name: "second.example.org" }));
    await user.click(screen.getByRole("button", { name: "Track 2 competitors" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not confirm every selected competitor. Try again.",
    );
    expect(screen.getByText(readyBody)).toBeVisible();
    expect(screen.queryByText(/^Confirmed\./)).toBeNull();
    expect(screen.queryByText("first.example.org")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "second.example.org" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Track 1 competitor" })).toBeVisible();

    calls.confirmSuggestedCompetitor.mockResolvedValueOnce({});
    await user.click(screen.getByRole("button", { name: "Track 1 competitor" }));

    expect(calls.confirmSuggestedCompetitor).toHaveBeenCalledTimes(3);
    expect(calls.confirmSuggestedCompetitor).toHaveBeenLastCalledWith({
      domain: "second.example.org",
      projectId,
    });
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledOnce());
  });

  it("records skip and renders the skipped state from the persisted outcome", async () => {
    const calls = actions();
    const user = userEvent.setup();
    render(
      <ConfirmCompetitorsStep
        actions={calls}
        projectId={projectId}
        state={competitorState(context({ completedCheckCount: 1 }))}
        suggestions={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(calls.skipCompetitorSetup).toHaveBeenCalledWith({ projectId });
    expect(screen.getByText(skippedBody)).toBeVisible();
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledOnce());
    expect(
      competitorState(context({ completedCheckCount: 1, competitorSetupOutcome: "skipped" })),
    ).toEqual({
      family: "skipped",
    });
  });

  it("renders confirmed when the skip action reports an existing tracked competitor", async () => {
    const calls = actions();
    calls.skipCompetitorSetup.mockResolvedValue({ outcome: "confirmed" });
    const user = userEvent.setup();
    render(
      <ConfirmCompetitorsStep
        actions={calls}
        projectId={projectId}
        state={competitorState(context({ completedCheckCount: 1 }))}
        suggestions={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Skip for now" }));

    expect(calls.skipCompetitorSetup).toHaveBeenCalledWith({ projectId });
    expect(screen.getByText(/^Confirmed\./)).toBeVisible();
    expect(screen.queryByText(skippedBody)).toBeNull();
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledOnce());
  });

  it("renders the skipped state with the Ready story fixture", async () => {
    const user = userEvent.setup();
    render(<ReadyStory />);

    await user.click(screen.getByRole("button", { name: "Skip for now" }));

    expect(screen.getByText(skippedBody)).toBeVisible();
  });

  it("accepts server evidence without importing rank or database readers", () => {
    const source = readFileSync("components/getting-started/ConfirmCompetitorsStep.tsx", "utf8");

    expect(source).toContain("suggestions: CompetitorSuggestionEvidence[]");
    expect(source).not.toMatch(
      /lib\/db\/prisma|organicRanks|getCompetitorSuggestions|rank-check\/organic-ranks/,
    );
  });
});
