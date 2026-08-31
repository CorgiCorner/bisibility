import type { SetupContext, SetupCta, SetupStepState } from "@/lib/getting-started/setup-steps";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GettingStartedChecklist } from "./GettingStartedChecklist";

const now = new Date("2026-08-30T17:00:00.000Z");

function context(overrides: Partial<SetupContext> = {}): SetupContext {
  return {
    completedCheckCount: 0,
    inFlightBatch: null,
    keywordCount: 0,
    keywordIds: [],
    project: { exists: false, name: null, publicRef: null },
    providerExists: false,
    schedule: { mode: "manual" },
    ...overrides,
  };
}

function contextFor(state: SetupStepState): SetupContext {
  const ready = {
    keywordCount: 1,
    project: {
      exists: true,
      name: "Project",
      publicRef: "prj_01h00000000000000000000000" as SetupContext["project"]["publicRef"],
    },
  };
  if (state.family === "done")
    return context({ ...ready, completedCheckCount: 1, providerExists: true });
  if (state.family === "blocked") return context(ready);
  if (state.family === "running")
    return context({
      ...ready,
      providerExists: true,
      inFlightBatch: {
        completed: state.progress.completed,
        rankCheckIds: [],
        total: state.progress.total,
      },
    });
  if (state.family === "waiting")
    return context({
      ...ready,
      providerExists: true,
      schedule: { mode: "scheduled", ...state.when },
    });
  return context({ ...ready, providerExists: true });
}

function setViewport(desktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(min-width:1024px)" ? desktop : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function setup(state: SetupStepState, desktop = true) {
  setViewport(desktop);
  const onCta = vi.fn<(cta: SetupCta) => void>();
  render(<GettingStartedChecklist context={contextFor(state)} now={now} onCta={onCta} />);
  return { onCta, user: userEvent.setup() };
}

beforeEach(() => setViewport(true));

describe("GettingStartedChecklist", () => {
  it("selects the first incomplete step by default and removes the inner progress header", () => {
    render(
      <GettingStartedChecklist
        context={context({
          keywordCount: 1,
          project: {
            exists: true,
            name: "Project",
            publicRef: "prj_01h00000000000000000000000",
          },
        })}
        now={now}
        onCta={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Connect a data source" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText(/Search Console is free and takes two clicks/)).toBeVisible();
    expect(screen.queryByText("Connect the source for rank data")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Connect data source" }).querySelector("svg"),
    ).not.toBeNull();
    expect(screen.queryByText(/of 4 complete/)).toBeNull();
    expect(screen.queryByText("Select a step to open its walkthrough.")).toBeNull();
  });

  it("falls back to the first step when every step is done", () => {
    setup({ family: "done" });
    expect(screen.getByRole("button", { name: "Create your project" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText(/^This happened when you created the project/)).toBeVisible();
    expect(screen.queryByText("Your project was created")).toBeNull();
    expect(screen.getByText(/^This happened when you created the project/)).not.toHaveClass("mb-3");
  });

  it("keeps written content in the expanded left row and only video anatomy on the right", () => {
    setup({ cta: { id: "run_first_check", label: "Run first check" }, family: "action" });
    const row = screen.getByRole("button", { name: "Run your first rank check" });
    const panel = document.getElementById(row.getAttribute("aria-controls") ?? "");
    const video = screen.getByRole("region", { name: "Video walkthrough" });

    expect(panel).not.toBeNull();
    expect(
      within(panel as HTMLElement).getByText(/Run the first check to collect positions/),
    ).toBeVisible();
    expect(
      within(panel as HTMLElement).queryByText("Collect the first keyword positions"),
    ).toBeNull();
    const badge = within(video).getByText("Coming soon");
    expect(video).toHaveClass("text-center");
    expect(badge.parentElement).toHaveClass("mx-auto", "flex", "items-center");
    expect(badge).toBeVisible();
    expect(badge).toHaveClass("border");
    expect(badge).toHaveStyle({ color: "var(--purple-text)" });
    expect(badge).not.toHaveClass("bg-accent-subtle", "text-accent-text");
    expect(within(video).getByText("Video walkthroughs")).toBeVisible();
    expect(
      within(video).getByText(
        "We are recording a short clip for each step. Until they land, every step on the left opens with its written version.",
      ),
    ).toBeVisible();
    expect(within(video).queryByText("Collect the first keyword positions")).toBeNull();
    expect(video).toHaveAttribute("data-video-ref", "first-check");
    expect(video).toHaveClass("w-full", "flex-1", "rounded-card", "border-dashed");
    expect(video.parentElement).toHaveClass("lg:flex", "p-5");
    expect(screen.getByRole("button", { name: "Run first check" })).toHaveClass(
      "MuiButton-outlined",
    );
    expect(screen.getByRole("button", { name: "Run first check" }).querySelector("svg")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Run your first rank check" })
        .parentElement?.querySelector("svg"),
    ).toBeNull();
  });

  it("keeps every expansion panel mounted with the source transitions", () => {
    setup({ cta: { id: "run_first_check", label: "Run first check" }, family: "action" });
    const panels = screen.getAllByTestId(/^setup-step-panel-/);

    expect(panels).toHaveLength(4);
    expect(panels[0]).toHaveClass("grid", "grid-rows-[0fr]", "opacity-0", "overflow-hidden");
    expect(panels[3]).toHaveClass("grid-rows-[1fr]", "opacity-100");
    expect(panels[3]).toHaveClass(
      "transition-none",
      "motion-safe:[transition:grid-template-rows_.24s_cubic-bezier(.32,.72,0,1),opacity_.18s_ease]",
    );
    expect(panels[0]).toHaveAttribute("aria-hidden", "true");
    expect(panels[3]).toHaveAttribute("aria-hidden", "false");
    expect(panels[0].firstElementChild).toHaveClass("min-h-0", "overflow-hidden");
    expect(panels[3].firstElementChild?.firstElementChild).toHaveClass("pl-[52px]", "pb-3");
    expect(
      screen.getByRole("button", { name: "Run your first rank check" }).parentElement,
    ).toHaveClass("pt-3.5", "pb-1.5");
    expect(screen.getByRole("button", { name: "Create your project" }).parentElement).toHaveClass(
      "pt-3.5",
      "pb-3.5",
    );
  });

  it("switches the expanded row and selected video reference", async () => {
    const { user } = setup({
      cta: { id: "run_first_check", label: "Run first check" },
      family: "action",
    });
    const create = screen.getByRole("button", { name: "Create your project" });
    const firstCheck = screen.getByRole("button", { name: "Run your first rank check" });

    expect(firstCheck).toHaveAttribute("aria-expanded", "true");
    await user.click(create);
    expect(create).toHaveAttribute("aria-expanded", "true");
    expect(firstCheck).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("region", { name: "Video walkthrough" })).toHaveAttribute(
      "data-video-ref",
      "create-project",
    );
  });

  it("uses a dashed circle for a first check blocked by a missing data source", () => {
    setup({
      family: "blocked",
      reason: "Needs a data source first",
      unblockedBy: "connect_source",
    });

    const row = screen.getByRole("button", { name: "Run your first rank check" });
    const glyph = row.parentElement?.querySelector('[data-testid="step-glyph-blocked"]');
    expect(glyph).toHaveClass("border-dashed");
  });

  it.each([
    ["action", { cta: { id: "run_first_check", label: "Run first check" }, family: "action" }],
    [
      "waiting",
      {
        accelerate: { id: "run_first_check", label: "Run it now instead" },
        family: "waiting",
        when: { nextRunAt: new Date("2026-08-31T04:00:00.000Z"), timezone: "Europe/Warsaw" },
      },
    ],
    ["running", { family: "running", progress: { completed: 2, total: 5 } }],
    [
      "blocked",
      { family: "blocked", reason: "Needs a data source first", unblockedBy: "connect_source" },
    ],
    ["done", { family: "done" }],
  ] satisfies Array<[string, SetupStepState]>)(
    "keeps the first-check row selectable in %s state",
    async (_name, state) => {
      const { user } = setup(state);
      const row = screen.getByRole("button", { name: "Run your first rank check" });
      await user.click(row);
      expect(row).toHaveAttribute("aria-expanded", "true");
      expect(document.getElementById("setup-walkthrough-first_check")).toHaveAttribute(
        "aria-hidden",
        "false",
      );
    },
  );

  it("keeps the waiting accelerator exactly once and preserves typed CTA dispatch", async () => {
    const cta = { id: "run_first_check", label: "Run it now instead" } as const;
    const { onCta, user } = setup({
      accelerate: cta,
      family: "waiting",
      when: { nextRunAt: new Date("2026-08-31T04:00:00.000Z"), timezone: "Europe/Warsaw" },
    });

    expect(screen.getAllByRole("button", { name: cta.label })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: cta.label }));
    expect(onCta).toHaveBeenCalledWith(cta);
  });

  it("keeps rows transparent, strikes completed titles, and omits the column divider", () => {
    const { container } = render(
      <GettingStartedChecklist
        context={contextFor({ family: "done" })}
        now={now}
        onCta={vi.fn()}
      />,
    );

    const checklist = screen.getByRole("region", { name: "Getting started checklist" });
    expect(checklist).not.toHaveClass("lg:border-r", "lg:border-border");
    const createTitle = screen.getByText("Create your project");
    expect(createTitle).toHaveClass("line-through", "text-fg-muted");
    expect(createTitle.closest("div.relative")).not.toHaveClass(
      "hover:bg-bg-sunken",
      "focus-within:bg-bg-sunken",
    );
    expect(container.querySelectorAll("li.border-t")).toHaveLength(3);
  });

  it("keeps done copy past tense and all copy free of banned promises", async () => {
    const { user } = setup({ family: "done" });
    await user.click(screen.getByRole("button", { name: "Run your first rank check" }));
    const panel = document.getElementById("setup-walkthrough-first_check");
    expect(within(panel as HTMLElement).getByText(/^This happened when/)).toBeVisible();
    expect(document.body.textContent).not.toMatch(
      /notify|notification|in progress|tonight|workspace|\u2014/i,
    );
  });

  it("opens the mobile Sheet only after row activation while retaining deterministic selection", async () => {
    const { user } = setup(
      { cta: { id: "run_first_check", label: "Run first check" }, family: "action" },
      false,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    const firstCheck = screen.getByRole("button", { name: "Run your first rank check" });
    expect(screen.getByRole("region", { name: "Video walkthrough" })).toHaveAttribute(
      "data-video-ref",
      "first-check",
    );
    await user.click(firstCheck);
    expect(screen.getByRole("dialog", { name: "Run your first rank check" })).toBeVisible();
    expect(screen.getByText(/Run the first check to collect positions/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close sheet" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
