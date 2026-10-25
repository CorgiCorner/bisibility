import { composeStories } from "@storybook/react";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as storyModule from "./PromptResearchClient.stories";
import { researchResultFixture } from "./prompt-research-fixtures";

vi.mock("@/lib/actions/prompt-research", () => ({
  lookupPromptResearchAction: vi.fn(),
  trackPromptResearchAction: vi.fn(),
}));
const stories = composeStories(storyModule);
afterEach(() => vi.restoreAllMocks());
it.each(Object.entries(stories))("renders the %s story with complete messages", (_name, Story) => {
  const errors = vi.spyOn(console, "error");
  render(<Story />);
  if (_name === "NoProvider") {
    expect(screen.getByText("Supported providers: DataForSEO.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Keyword" })).toBeDisabled();
  } else
    expect(
      screen.getByRole("textbox", {
        name: _name === "ReviewDrawer" ? "Topic (choose above or type a new one)" : "Keyword",
      }),
    ).toBeInTheDocument();
  expect(errors).not.toHaveBeenCalled();
});

it("does not run table interactions behind the review drawer", () => {
  expect(storyModule.ReviewDrawer.play).toBeUndefined();
});

it("keeps all four combinations of brand and own-site signals in the story fixtures", () => {
  expect(
    new Set(
      researchResultFixture.prompts.map(
        (prompt) => `${prompt.brandMentioned}:${prompt.ownDomainCited}`,
      ),
    ),
  ).toEqual(new Set(["true:true", "true:false", "false:true", "false:false"]));
});
