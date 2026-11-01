import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { inputActionSizeClassName } from "@/components/ui/input-styles";
import type { PromptResearchPageData } from "@/lib/actions/prompt-research";
import research from "@/messages/core/en/project-ai-research.json";
import tracking from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PromptResearchClient } from "./PromptResearchClient";
import { researchPageFixture, researchResultFixture } from "./prompt-research-fixtures";

const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("@/lib/actions/prompt-research", () => ({ lookupPromptResearchAction: mocks.lookup }));
type Page = PromptResearchPageData;
function view(
  initial?: Page["initial"],
  keyword = "tools",
  keywords = researchPageFixture.keywords,
) {
  return render(
    <FeatureMessagesProvider
      locale="en"
      messages={{ ...shared, ...tracking, ...research }}
      timeZone="UTC"
    >
      <PromptResearchClient
        projectId="prj_public"
        keyword={keyword}
        data={{ ...researchPageFixture, keywords, initial }}
      />
    </FeatureMessagesProvider>,
  );
}
afterEach(() => vi.unstubAllGlobals());
it("keeps one description, a compact search form and the same estimate instruction as Brand Visibility", () => {
  view(undefined, "", []);
  expect(
    screen.queryByText(
      "Find dataset questions people ask AI about your market and the sites the answers cite.",
    ),
  ).not.toBeInTheDocument();
  expect(screen.getByText(research.projectAiResearch.estimateRequired)).toHaveAttribute(
    "id",
    "research-cost",
  );
  expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute("data-variant", "primary");
  expect(screen.getByRole("button", { name: "Search" })).toHaveClass(
    ...inputActionSizeClassName.split(" "),
  );
  const empty = screen.getByText(
    "Add Prompt Tracker topics or Rank Tracker keywords, or search a keyword above.",
  );
  expect(empty.closest("[data-empty-state]")).toBeNull();
  expect(
    screen.getByText("Select a keyword to see the prompts people ask AI about it."),
  ).toBeVisible();
});
it("places BackLink before the search card and cache/count metadata in the results heading row", () => {
  view(researchResultFixture);
  const back = screen.getByRole("link", { name: "Relevant keywords" });
  expect(back.querySelector("svg")).not.toBeNull();
  expect(
    back.compareDocumentPosition(screen.getByRole("textbox")) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  const heading = screen.getByRole("heading", { name: "Prompts about “tools”" });
  expect(
    within(heading.parentElement as HTMLElement).getByText("Cached result · no new charge"),
  ).toBeVisible();
  expect(within(heading.parentElement as HTMLElement).getByText("8 prompts")).toBeVisible();
  expect(heading.parentElement).toHaveClass(
    "flex-col",
    "items-start",
    "sm:flex-row",
    "sm:items-center",
  );
  expect(screen.getByText("Cached result · no new charge").parentElement).toHaveClass(
    "justify-start",
    "sm:ml-auto",
    "sm:justify-end",
  );
});
it("offers shared Integrations access and locks retry for a missing source", () => {
  view({ ok: false, reason: "no_source", message: "raw" });
  expect(
    screen.getByRole("link", { name: shared.shared.providerAccess.connectAction }),
  ).toHaveAttribute("href", "/app/prj_public/providers");
  expect(screen.getByText("Supported providers: DataForSEO.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Refresh estimate" })).not.toBeInTheDocument();
  expect(mocks.lookup).not.toHaveBeenCalled();
});

it("renders selectable, tracked, merged, long and memory-only prompts on mobile and preserves expansion across resizing", async () => {
  let narrow = true;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", () => ({
    matches: narrow,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
  const user = userEvent.setup();
  view(researchResultFixture);
  const list = screen.getByRole("list", { name: "Prompts about “tools”" });
  expect(list.children).toHaveLength(8);
  expect(screen.getByText(researchResultFixture.prompts[7].text)).toBeVisible();
  expect(
    screen.queryByRole("checkbox", { name: `Select ${researchResultFixture.prompts[1].text}` }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("+2 similar prompts merged")).toBeVisible();
  const first = list.children[0] as HTMLElement;
  expect(within(first).getByText("Brand mentioned")).toBeVisible();
  expect(within(first).getByText("Cites your site")).toBeVisible();
  const memory = list.children[2] as HTMLElement;
  expect(within(memory).queryByText("Brand mentioned")).not.toBeInTheDocument();
  expect(within(memory).queryByText("Cites your site")).not.toBeInTheDocument();
  const expand = screen.getByRole("button", { name: /Show sources for Best tools/ });
  expect(expand.querySelector("svg")).not.toBeNull();
  await user.click(expand);
  expect(within(first).getByText("Your site").closest("li")).toHaveClass("bg-green/5");
  expect(document.getElementById(expand.getAttribute("aria-controls") ?? "")).toHaveTextContent(
    "Example tools",
  );
  await user.click(
    screen.getByRole("button", { name: /Show sources for Which tools work offline/ }),
  );
  expect(screen.getByText(/The AI answered from memory/)).toBeVisible();
  await user.click(screen.getByRole("checkbox", { name: "Select Best tools?" }));
  const { act } = await import("@testing-library/react");
  act(() => {
    narrow = false;
    listeners.forEach((fn) => {
      fn();
    });
  });
  expect(screen.getByRole("checkbox", { name: "Select Best tools?" })).toBeChecked();
  expect(screen.getByRole("button", { name: /Show sources for Best tools/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});
