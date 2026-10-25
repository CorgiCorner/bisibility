import { TooltipProvider } from "@/components/ui/Tooltip";
import { setNavigationState } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResearchShell } from "./ResearchShell.stories";

vi.mock("@/lib/actions/ai-research", () => ({ analyzeAiResearchAction: vi.fn() }));
describe("research modules in the real application shell", () => {
  it.each([
    ["audit", "site-audit", "Site Audit"],
    ["visibility", "brand-visibility", "Brand Visibility"],
    ["prompt", "prompt-playground", "Prompt Playground"],
  ] as const)("renders one shared page heading for %s", (module, section, title) => {
    setNavigationState({ pathname: `/app/prj_example/${section}` });
    render(
      <TooltipProvider>
        <ResearchShell module={module} />
      </TooltipProvider>,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(title);
    expect(screen.getByRole("main")).toBeTruthy();
  });
});
