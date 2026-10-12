/// <reference types="vite/client" />
import "@/app/globals.css";
import "@/.storybook/preview-fonts.css";
import { AiModelSelect } from "@/components/ai-research/AiCostPolicyFields";
import { aiResearchCatalogFixture } from "@/components/ai-research/ai-research-fixtures";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import ai from "@/messages/core/en/project-ai-research.json";
import shared from "@/messages/core/en/shared.json";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";

afterEach(async () => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  await cdp().send("Emulation.setEmulatedMedia", { features: [] });
});
const cases = [2048, 834, 390].flatMap((width) =>
  ["light", "dark"].map((theme) => ({ width, theme })),
);
it.each(cases)(
  "shows the real model picker's available and unavailable views at $width/$theme",
  async ({ width, theme }) => {
    await page.viewport(width, 900);
    document.documentElement.dataset.theme = theme;
    document.body.style.fontFamily = "var(--font-sans), sans-serif";
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    const changed = vi.fn();
    const blocked = aiResearchCatalogFixture.models[2];
    const catalog = {
      ...aiResearchCatalogFixture,
      models: [
        ...aiResearchCatalogFixture.models,
        ...Array.from({ length: 24 }, (_, i) => ({
          ...blocked,
          id: `model-${i}`,
          label: `Provider model ${i}`,
        })),
      ],
    };
    render(
      <FeatureMessagesProvider locale="en" timeZone="UTC" messages={{ ...shared, ...ai }}>
        <div className="min-h-screen bg-bg p-4 text-fg sm:p-5 lg:p-7">
          <div className="grid w-full max-w-[800px] gap-4 rounded-card border border-border bg-bg-elev p-5 sm:grid-cols-2">
            {[0, 1].map((index) => (
              <div className="min-w-0" key={index}>
                <p className="mb-2 text-ui-body">
                  {index ? ai.projectAiResearch.secondModel : ai.projectAiResearch.firstModel}
                </p>
                <AiModelSelect
                  catalog={catalog}
                  actual={false}
                  disabled={false}
                  index={index}
                  models={["gpt-4.1-mini", "gpt-4.1-nano"]}
                  onChange={changed}
                />
              </div>
            ))}
          </div>
        </div>
      </FeatureMessagesProvider>,
    );
    const trigger = screen.getByRole("button", { name: ai.projectAiResearch.firstModel });
    await userEvent.click(trigger);
    expect(screen.queryByRole("menuitem", { name: "Reasoning example" })).toBeNull();
    await page.screenshot({
      path: `../.tmp/ui-comparison/model-picker-${width}-${theme}-available.png`,
    });
    await userEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Show unavailable models" }),
    );
    const unavailable = screen.getByRole("menuitem", { name: "Reasoning example" });
    expect(unavailable).toHaveAttribute("aria-disabled", "true");
    expect(unavailable.textContent).toContain("Select actual provider cost");
    const menu = screen.getByRole("menu");
    const popup = menu.getBoundingClientRect();
    expect(Math.abs(popup.width - trigger.getBoundingClientRect().width)).toBeLessThan(1);
    expect(popup.height).toBeLessThanOrEqual(360);
    expect(popup.right).toBeLessThanOrEqual(width - 16);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `../.tmp/ui-comparison/model-picker-${width}-${theme}-unavailable.png`,
    });
    unavailable.click();
    expect(changed).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(document.activeElement).toBe(trigger);
  },
);
