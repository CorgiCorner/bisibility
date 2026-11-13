import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import tracking from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { AiVisibilityTabs } from "./AiVisibilityTabs";

function tabs(props: Partial<Parameters<typeof AiVisibilityTabs>[0]> = {}) {
  return render(
    <FeatureMessagesProvider locale="en" messages={{ ...shared, ...tracking }} timeZone="UTC">
      <AiVisibilityTabs active="prompts" projectId="prj_example" {...props} />
    </FeatureMessagesProvider>,
  );
}

it("renders the registered tabs and the active prompt count", () => {
  tabs({ promptCount: 3, trackingView: "runs" });
  const prompts = screen.getByRole("link", { current: "page" });
  const research = screen.getByRole("link", { name: "Research" });
  const overview = screen.getByRole("link", { name: "Overview" });
  expect(prompts).toHaveTextContent("Prompts");
  expect(prompts).toHaveTextContent("3");
  expect(prompts).toHaveAttribute("href", "/app/prj_example/ai-visibility?tab=prompts&view=runs");
  expect(research).not.toHaveAttribute("aria-current");
  expect(research).toHaveAttribute("href", "/app/prj_example/ai-visibility?tab=research");
  expect(overview).toHaveAttribute("href", "/app/prj_example/ai-visibility?tab=overview");
  expect(screen.getByRole("navigation", { name: "AI Visibility" })).toBeInTheDocument();
});

it("keeps the research keyword and omits the count when the tracker loader did not run", () => {
  tabs({ active: "research", keyword: "seo tools" });
  expect(screen.getByRole("link", { name: "Prompts" })).toHaveAttribute(
    "href",
    "/app/prj_example/ai-visibility?tab=prompts",
  );
  expect(screen.getByRole("link", { name: "Research" })).toHaveAttribute(
    "href",
    "/app/prj_example/ai-visibility?tab=research&q=seo+tools",
  );
  expect(screen.getByRole("link", { name: "Research" })).toHaveAttribute("aria-current", "page");
});

it("scrolls the tab strip inside the page and keeps actions on the next row below md", () => {
  tabs({ actions: <button type="button">Run now</button> });
  const strip = document.querySelector("[data-tab-strip]");
  expect(strip).not.toBeNull();
  expect(strip?.className).toContain("min-w-0");
  expect(strip?.className).toContain("overflow-x-auto");
  expect(strip?.className).toContain("w-full");
  const track = strip?.querySelector("[data-tab-track]");
  expect(track?.parentElement).toBe(strip);
  expect(track?.className).toContain("border-b");
  expect(strip?.parentElement?.className).toContain("min-w-0");
  expect(strip?.parentElement?.className).not.toContain("border-b");
  expect(strip?.parentElement?.className).toContain("flex-col");
  expect(strip?.parentElement?.className).toContain("md:flex-row");
  const nav = screen.getByRole("navigation", { name: "AI Visibility" });
  for (const link of within(nav).getAllByRole("link")) {
    expect(link.className).toContain("whitespace-nowrap");
    expect(link.className).toContain("-mb-px");
  }
});

it("updates every active tab when server props change", () => {
  const { rerender } = renderWithFeatureMessages(
    <AiVisibilityTabs active="overview" projectId="prj_example" />,
    { messages: { ...shared, ...tracking } },
  );
  for (const [active, label] of [
    ["prompts", "Prompts"],
    ["research", "Research"],
    ["sources", "Sources"],
    ["engines", "Engines"],
    ["overview", "Overview"],
  ] as const) {
    rerender(<AiVisibilityTabs active={active} projectId="prj_example" />);
    expect(screen.getByRole("link", { current: "page" })).toHaveTextContent(label);
  }
});
