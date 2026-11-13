import { renderWithTimelineMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { AnnotationsView } from "@/lib/annotations/types";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { AnnotationsBoard } from "./AnnotationsBoard";

vi.mock("@/lib/actions/signals", () => ({
  addSignalNote: vi.fn(),
  removeSignalNote: vi.fn(),
  searchAnnotationPages: vi.fn(async () => ({ pages: [] })),
}));

const view: AnnotationsView = {
  now: "2026-11-10T12:00:00.000Z",
  signals: [
    {
      actor: "Ada",
      happenedAt: "2026-11-01T00:00:00.000Z",
      id: "sig_note",
      payload: { note: "Added FAQ" },
      source: "manual",
      type: "note",
      url: null,
    },
    {
      actor: null,
      happenedAt: "2026-11-02T00:00:00.000Z",
      id: "sig_rank",
      payload: { title: "Rank moved" },
      source: "rank_tracker",
      type: "rank.changed",
      url: null,
    },
    {
      actor: null,
      happenedAt: "2026-10-01T00:00:00.000Z",
      id: "sig_deploy",
      payload: { message: "Ship checkout" },
      source: "deploy",
      type: "deploy.completed",
      url: null,
    },
  ],
  timeZone: "UTC",
  updates: [
    {
      beginsAt: "2026-09-24T16:15:00.000Z",
      endsAt: "2026-10-08T08:00:00.000Z",
      id: "XhUD",
      name: "September 2026 spam update",
      service: "Ranking",
      uri: "incidents/XhUD",
    },
  ],
  windowStart: "2026-08-12T12:00:00.000Z",
};

function board(props: Partial<ComponentProps<typeof AnnotationsBoard>> = {}) {
  return (
    <AnnotationsBoard
      canCreate
      canDelete
      developersHref="/app/prj_example/settings/developers"
      hideAutomatic={false}
      initialFilter="all"
      initialSelected={null}
      locale="en"
      projectId="prj_example"
      view={view}
      {...props}
    />
  );
}

describe("AnnotationsBoard", () => {
  it("uses the pin tones for every legend chip's inherited badge color", () => {
    const { container } = render(board());
    const legend = container.querySelector("[data-annotation-legend]");
    const chips = legend?.querySelectorAll("button");
    expect(chips).toHaveLength(5);
    for (const [index, [letter, tone]] of [
      ["N", "text-yellow-text"],
      ["G", "text-blue-text"],
      ["D", "text-red-text"],
      ["C", "text-purple-text"],
      ["S", "text-green-text"],
    ].entries()) {
      const chip = chips?.[index];
      expect(chip).toHaveClass(tone);
      const badge = chip?.querySelector("[data-annotation-badge]");
      expect(badge).toHaveTextContent(letter);
      expect(badge?.querySelector("circle")).toHaveClass("stroke-current");
      expect(badge?.querySelector("text")).toHaveClass("fill-current");
    }
  });

  it("hides rank signals, leaves only notes when automatic entries are hidden, and shows the selected detail", async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(board());

    expect(screen.queryByText("Rank moved")).not.toBeInTheDocument();
    expect(screen.getAllByText("Added FAQ").length).toBeGreaterThan(0);
    expect(screen.getAllByText("September 2026 spam update").length).toBeGreaterThan(0);
    expect(container.querySelector("[data-annotation-band]")).not.toBeNull();
    expect(container.querySelector("[data-annotations-blocks]")).toHaveAttribute(
      "data-annotations-blocks",
      "lead ruler composer filters board sources",
    );
    const list = container.querySelector<HTMLElement>("[data-annotation-list]");
    if (!list) throw new Error("Missing annotation list");
    expect(list).toHaveClass("overflow-hidden", "rounded-card");
    const selected = list?.querySelector("button[aria-pressed='true']");
    expect(selected).toHaveClass("focus-visible:-outline-offset-2");

    await user.click(within(list).getByRole("button", { name: /Ship checkout/ }));
    expect(routerMock.push).toHaveBeenCalledWith("/app/prj_example/annotations?q=sig_deploy", {
      scroll: false,
    });
    setNavigationState({ searchParams: { q: "sig_deploy" } });
    rerender(board({ initialSelected: "sig_deploy" }));
    expect(
      screen.getByText(
        "From a deploy webhook. The provider, environment and deployment id are kept when they are sent.",
      ),
    ).toBeInTheDocument();

    const hideAutomatic = screen.getByRole("button", { name: "Hide automatic" });
    expect(hideAutomatic).toHaveAttribute("aria-pressed", "false");
    expect(hideAutomatic).toHaveAttribute("data-variant", "ghost");
    expect(hideAutomatic.className).toContain("ms-auto");
    const noteField = screen.getByPlaceholderText(
      "What did you change? e.g. Added FAQ to 20 tool pages",
    );
    expect(noteField.tagName).toBe("TEXTAREA");
    expect(noteField).toHaveAttribute("rows", "1");

    await user.click(hideAutomatic);
    expect(routerMock.push).toHaveBeenLastCalledWith(
      "/app/prj_example/annotations?q=sig_deploy&auto=0",
      { scroll: false },
    );
    rerender(board({ hideAutomatic: true, initialSelected: "sig_deploy" }));
    expect(screen.getByRole("button", { name: "Show automatic" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByText("Added FAQ").length).toBeGreaterThan(0);
    expect(screen.queryByText("Ship checkout")).not.toBeInTheDocument();
    expect(screen.queryByText("September 2026 spam update")).not.toBeInTheDocument();
    expect(screen.getByText("Manual note.")).toBeInTheDocument();
  });
});

it("restores filters and q selection on soft navigation and history", () => {
  const { container, rerender } = render(board());
  const list = () => {
    const element = container.querySelector<HTMLElement>("[data-annotation-list]");
    if (!element) throw new Error("Missing annotation list");
    return element;
  };
  rerender(board({ initialSelected: "sig_deploy" }));
  expect(within(list()).getByRole("button", { name: /Ship checkout/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  rerender(board({ initialFilter: "note", initialSelected: "sig_note" }));
  expect(screen.queryByText("Ship checkout")).not.toBeInTheDocument();
  expect(screen.getByText("Manual note.")).toBeInTheDocument();
  rerender(board({ initialSelected: "sig_deploy" }));
  expect(within(list()).getByRole("button", { name: /Ship checkout/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  rerender(board({ hideAutomatic: true }));
  expect(screen.queryByText("Ship checkout")).not.toBeInTheDocument();
  rerender(board());
  expect(within(list()).getByRole("button", { name: /Ship checkout/ })).toBeInTheDocument();
});
