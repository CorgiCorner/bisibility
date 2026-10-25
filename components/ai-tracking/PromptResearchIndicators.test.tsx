import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import tracking from "@/messages/core/en/project-ai-tracking.json";
import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { PromptResearchSourceCount, PromptResearchText } from "./PromptResearchCells";
import { PromptResearchSources } from "./PromptResearchSources";
import { researchResultFixture } from "./prompt-research-fixtures";

it.each([
  [true, true],
  [true, false],
  [false, true],
  [false, false],
])(
  "shows independent positive brand (%s) and citation (%s) indicators",
  (brandMentioned, ownDomainCited) => {
    const prompt = {
      ...researchResultFixture.prompts[0],
      brandMentioned,
      ownDomainCited,
    };
    const { container } = render(
      <FeatureMessagesProvider locale="en" messages={tracking} timeZone="UTC">
        <PromptResearchText prompt={prompt} />
        <PromptResearchSourceCount prompt={prompt} />
      </FeatureMessagesProvider>,
    );
    for (const [label, present] of [
      ["Brand mentioned", brandMentioned],
      ["Cites your site", ownDomainCited],
    ] as const) {
      const indicator = screen.queryByText(label);
      if (present) {
        expect(indicator).toBeVisible();
        expect(indicator).toHaveClass("text-green-text", "text-ui-xs");
        expect(indicator?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      } else expect(indicator).not.toBeInTheDocument();
    }
    if (brandMentioned)
      expect(screen.getByText("Brand mentioned").parentElement).toBe(
        screen.getByText("+2 similar prompts merged").closest("[data-research-prompt] > div"),
      );
    expect(container.querySelector("[data-status-pill]")).toBeNull();
  },
);

it("highlights only the project's source and replaces the expanded mention badge", () => {
  render(
    <FeatureMessagesProvider locale="en" messages={tracking} timeZone="UTC">
      <PromptResearchSources prompt={researchResultFixture.prompts[3]} />
    </FeatureMessagesProvider>,
  );
  const own = screen.getByText("Your site").closest("li");
  expect(own).toHaveClass("bg-green/5");
  expect(within(own as HTMLElement).getByRole("link", { name: "Example tools" })).toBeVisible();
  const other = screen.getByRole("link", { name: "Team software comparison guide" }).closest("li");
  expect(other).not.toHaveClass("bg-green/5");
  expect(screen.queryByText(/brand.*mentioned/i)).not.toBeInTheDocument();
  expect(screen.queryByText("You")).not.toBeInTheDocument();
});
