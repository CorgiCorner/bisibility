import { aiVisibilityBlocks } from "@/components/tracking-loading/ai-visibility-layout";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import tracking from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AiVisibilityOverviewView } from "./AiVisibilityOverviewView";
import {
  emptyOverviewFixture,
  overviewBrandNames,
  overviewFixture,
  overviewHrefs,
  overviewProjectId,
} from "./overview-fixtures";

const messages = { ...shared, ...tracking };

function renderOverview(
  model = overviewFixture(),
  onFilter: (filters: ReturnType<typeof overviewFixture>["filters"]) => void = () => undefined,
  extras: { enabledEngines?: readonly string[]; enginesHref?: string } = {},
) {
  return renderWithFeatureMessages(
    <AiVisibilityOverviewView
      brandNames={overviewBrandNames}
      enabledEngines={extras.enabledEngines}
      hrefs={{ ...overviewHrefs, engines: extras.enginesHref ?? overviewHrefs.engines }}
      model={model}
      onAddCompetitor={async () => undefined}
      onFilter={onFilter}
      onPreviewNames={async () => overviewBrandNames.counts}
      onSaveNames={async () => undefined}
      onSplitAlias={async () => undefined}
      projectId={overviewProjectId}
    />,
    { messages, timeZone: "UTC" },
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

it("shows mentions, citations, share of voice and cited domains from the projection", () => {
  renderOverview();
  expect(
    screen.getByText("Who AI answers name and which pages they cite. Also known as GEO or AEO."),
  ).toBeTruthy();
  expect(screen.getAllByText("2 of 3").length).toBeGreaterThan(0);
  expect(screen.getByRole("heading", { name: "Where to show up next" })).toHaveClass(
    "text-ui-section",
  );
  expect(screen.getByText(/ChatGPT cites/)).toBeTruthy();
  expect(screen.getAllByText("guides.example.com").length).toBeGreaterThan(0);
  expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  expect(screen.queryByRole("link", { name: "Open sources" })).toBeNull();
  expect(screen.getByRole("link", { name: "Run now" })).toHaveAttribute("href", overviewHrefs.run);
  expect(document.querySelector("[data-visibility-blocks]")).toHaveAttribute(
    "data-visibility-blocks",
    aiVisibilityBlocks.overview.join(" "),
  );
  expect(screen.getAllByRole("link", { name: "Add prompts" })[0]).toHaveAttribute(
    "href",
    overviewHrefs.addPrompt,
  );
  const names = screen.getAllByRole("button", { name: "Names" })[0];
  expect(names).toHaveAttribute("data-variant", "outline");
  expect(names).toHaveAttribute("data-size", "sm");
  expect(names).toHaveClass("whitespace-nowrap");
  expect(screen.getByRole("button", { name: "Your brand names" })).toHaveAttribute(
    "data-variant",
    "secondary",
  );
  expect(screen.getByRole("link", { name: "Edit competitors" })).toHaveAttribute(
    "data-variant",
    "ghost",
  );
  const engines = screen.getByRole("table", { name: "By engine" });
  expect(engines.style.getPropertyValue("--dt-col-provider")).not.toBe("");
  const provider = engines.querySelector<HTMLElement>('[data-column-id="provider"]');
  expect(provider).toHaveStyle({ flexGrow: "1" });
  const seen = screen.getAllByText("Seen in answers")[0];
  expect(seen?.closest(".flex-col")).toBeTruthy();
  expect(seen?.className).toContain("whitespace-nowrap");
  const row = screen.getByRole("row", { name: /ChatGPT/ });
  expect(row).toHaveStyle({ height: "56px" });
});

it("lists an enabled engine with no answers and links to the Engines tab", () => {
  renderOverview(overviewFixture(), () => undefined, {
    enabledEngines: ["claude"],
    enginesHref: "/app/prj_example/ai-visibility?tab=engines",
  });
  expect(screen.getByRole("link", { name: "Manage engines" })).toHaveAttribute(
    "href",
    "/app/prj_example/ai-visibility?tab=engines",
  );
  expect(screen.getByRole("row", { name: /Claude/ })).toHaveTextContent("No answers yet");
});

it("keeps add-as-competitor on one line", () => {
  renderOverview();
  const adds = screen.getAllByRole("button", { name: "Add as competitor" });
  expect(adds.length).toBeGreaterThan(0);
  for (const add of adds) {
    expect(add).toHaveClass("whitespace-nowrap");
    expect(add).toHaveAttribute("data-variant", "secondary");
    expect(add).toHaveAttribute("data-size", "sm");
  }
});

it("links the insight to the sources href it is given", () => {
  const sources = "/app/prj_abcdefghijklmnopqrstuvwx/ai-visibility?tab=sources&prompts=unbranded";
  renderWithFeatureMessages(
    <AiVisibilityOverviewView
      brandNames={overviewBrandNames}
      hrefs={{ ...overviewHrefs, sources }}
      model={overviewFixture()}
      onAddCompetitor={async () => undefined}
      onFilter={() => undefined}
      onPreviewNames={async () => overviewBrandNames.counts}
      onSaveNames={async () => undefined}
      onSplitAlias={async () => undefined}
      projectId={overviewProjectId}
    />,
    { messages, timeZone: "UTC" },
  );
  const openSources = screen.getByRole("link", { name: "Open sources" });
  expect(openSources).toHaveAttribute("href", sources);
  expect(openSources).toHaveAttribute("data-variant", "secondary");
  expect(openSources).toHaveAttribute("data-size", "sm");
  expect(openSources.className).toContain("w-fit");
  expect(openSources.className).toContain("self-start");
  expect(openSources.className).not.toContain("w-full");
});

it("dismisses the insight for this browser", async () => {
  renderOverview();
  await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.queryByText("Where to show up next")).toBeNull();
});

it("keeps the unbranded split at zero when only branded prompts match", () => {
  renderOverview(overviewFixture("branded"));
  expect(screen.getByText(/0 of 0/)).toBeTruthy();
  expect(screen.getByText("Starts after the second day of answers.")).toBeTruthy();
  expect(screen.queryByText("Where to show up next")).toBeNull();
});

it("shows one empty state when the project has no answers", () => {
  renderOverview(emptyOverviewFixture());
  expect(screen.getByText("No answers yet")).toBeTruthy();
  expect(screen.queryByText("Brands in answers")).toBeNull();
  expect(screen.queryByRole("button", { name: "Last 30 days" })).toBeNull();
});

it("reports a period change from the filter row", async () => {
  const onFilter = vi.fn();
  renderOverview(overviewFixture(), onFilter);
  await userEvent.click(screen.getByRole("button", { name: "Period" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Last 7 days" }));
  expect(onFilter).toHaveBeenCalledWith(expect.objectContaining({ period: "7d" }));
});

it("renders a changed filter and projection without remounting the overview", () => {
  const props = {
    brandNames: overviewBrandNames,
    hrefs: overviewHrefs,
    onAddCompetitor: async () => undefined,
    onFilter: () => undefined,
    onPreviewNames: async () => overviewBrandNames.counts,
    onSaveNames: async () => undefined,
    onSplitAlias: async () => undefined,
    projectId: overviewProjectId,
  };
  const model = overviewFixture();
  const { rerender } = renderWithFeatureMessages(
    <AiVisibilityOverviewView {...props} model={model} />,
    { messages },
  );
  expect(screen.getAllByText("guides.example.com").length).toBeGreaterThan(0);
  const next = emptyOverviewFixture();
  rerender(
    <AiVisibilityOverviewView
      {...props}
      model={{ ...next, hasAnswers: true, filters: { ...next.filters, period: "7d" } }}
    />,
  );
  expect(screen.queryByText("guides.example.com")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Period" })).toHaveTextContent("7");
  rerender(<AiVisibilityOverviewView {...props} model={model} />);
  expect(screen.getAllByText("guides.example.com").length).toBeGreaterThan(0);
});
