import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type { PromptResearchPageData } from "@/lib/actions/prompt-research";
import research from "@/messages/core/en/project-ai-research.json";
import tracking from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PromptResearchClient } from "./PromptResearchClient";
import { researchPageFixture, researchResultFixture } from "./prompt-research-fixtures";

vi.mock("@/lib/capacity/client-actions", () => ({ trackPromptResearchAction: vi.fn() }));
vi.mock("@/lib/actions/prompt-research", () => ({ lookupPromptResearchAction: vi.fn() }));

type Page = PromptResearchPageData;
function view(initial?: Page["initial"], keyword = "tools") {
  return render(
    <FeatureMessagesProvider
      locale="en"
      messages={{ ...shared, ...tracking, ...research }}
      timeZone="UTC"
    >
      <PromptResearchClient
        projectId="prj_public"
        keyword={keyword}
        data={{ ...researchPageFixture, initial }}
      />
    </FeatureMessagesProvider>,
  );
}

it("leads with the question, a static market chip and one priced action", () => {
  view(undefined, "");
  expect(
    screen.getByText(
      "Questions people ask AI about your topic, who gets named, and where you are missing.",
    ),
  ).toBeVisible();
  expect(screen.getByText("United States · English")).toBeVisible();
  expect(screen.getByText("Source: AI answers")).toBeVisible();
  expect(screen.queryByRole("button", { name: /From Google/ })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Brand lookup" })).toHaveAttribute(
    "href",
    "/app/prj_public/ai-visibility?tab=research&view=brand",
  );
  const action = screen.getByRole("button", { name: "Find prompts" });
  expect(action).toHaveAttribute("data-variant", "primary");
  expect(action).toHaveAttribute("type", "submit");
});

it("shows a cached lookup without asking for payment again", () => {
  view(researchResultFixture);
  expect(screen.getByText("Cached result · no new charge")).toBeVisible();
  expect(screen.getByRole("tab", { name: /All/ })).toBeVisible();
  expect(screen.getByRole("tab", { name: /Missing/ })).toBeVisible();
  expect(screen.getByRole("tab", { name: /Shared/ })).toBeVisible();
  expect(screen.getByRole("tab", { name: /Only you/ })).toBeVisible();
  expect(screen.getByRole("columnheader", { name: "AI volume" })).toBeVisible();
});

it("offers shared Integrations access and locks retry for a missing source", () => {
  view({ ok: false, reason: "no_source", message: "raw" });
  expect(
    screen.getByRole("link", { name: shared.shared.providerAccess.connectAction }),
  ).toHaveAttribute("href", "/app/prj_public/providers");
  expect(screen.getByText("Supported providers: DataForSEO.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Find prompts" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Refresh estimate" })).not.toBeInTheDocument();
});
