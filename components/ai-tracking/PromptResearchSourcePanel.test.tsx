import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import tracking from "@/messages/core/en/project-ai-tracking.json";
import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { PromptResearchSourcePanel } from "./PromptResearchSourcePanel";
import { researchResultFixture } from "./prompt-research-fixtures";

it("indents sources by the selection column so they start at the prompt text edge", () => {
  const { container } = render(
    <FeatureMessagesProvider locale="en" messages={tracking} timeZone="UTC">
      <PromptResearchSourcePanel prompt={researchResultFixture.prompts[0]} />
    </FeatureMessagesProvider>,
  );
  expect(container.querySelector("#research-sources-0")).toHaveClass("pl-11");
});
