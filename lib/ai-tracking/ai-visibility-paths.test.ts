import { describe, expect, it } from "vitest";
import {
  aiVisibilityComposeHref,
  aiVisibilityRegisteredHref,
  aiVisibilityTabHref,
  brandVisibilityRedirectPath,
  promptResearchRedirectPath,
  promptTrackerRedirectPath,
} from "./ai-visibility-paths";

describe("AI Visibility paths", () => {
  it("builds tab links and keeps the research keyword", () => {
    expect(aiVisibilityTabHref("prj_1", "prompts")).toBe("/app/prj_1/ai-visibility?tab=prompts");
    expect(aiVisibilityTabHref("prj_1", "prompts", { view: "runs" })).toBe(
      "/app/prj_1/ai-visibility?tab=prompts&view=runs",
    );
    expect(aiVisibilityTabHref("prj_1", "research", { keyword: "seo tools" })).toBe(
      "/app/prj_1/ai-visibility?tab=research&q=seo+tools",
    );
    expect(aiVisibilityTabHref("prj_1", "research", { view: "brand" })).toBe(
      "/app/prj_1/ai-visibility?tab=research&view=brand",
    );
    expect(aiVisibilityComposeHref("prj_1", "run")).toBe(
      "/app/prj_1/ai-visibility?tab=prompts&compose=run",
    );
    expect(aiVisibilityRegisteredHref("prj_1", "overview")).toBe(
      "/app/prj_1/ai-visibility?tab=overview",
    );
    expect(aiVisibilityRegisteredHref("prj_1", "sources")).toBe(
      "/app/prj_1/ai-visibility?tab=sources",
    );
    expect(aiVisibilityRegisteredHref("prj_1", "engines")).toBe(
      "/app/prj_1/ai-visibility?tab=engines",
    );
  });

  it("redirects the tracker and preserves the runs view and other parameters", () => {
    expect(promptTrackerRedirectPath("prj_1")).toBe("/app/prj_1/ai-visibility?tab=prompts");
    expect(promptTrackerRedirectPath("prj_1", { tab: "prompts", extra: "1" })).toBe(
      "/app/prj_1/ai-visibility?tab=prompts&extra=1",
    );
    expect(promptTrackerRedirectPath("prj_1", { tab: "runs", extra: "1" })).toBe(
      "/app/prj_1/ai-visibility?tab=prompts&view=runs&extra=1",
    );
    expect(promptTrackerRedirectPath("prj_1", { tab: "prompts", view: "runs" })).toBe(
      "/app/prj_1/ai-visibility?tab=prompts&view=runs",
    );
    expect(promptTrackerRedirectPath("prj_1", { tab: "schedules" })).toBe("/app/prj_1/schedules");
    expect(promptTrackerRedirectPath("prj_1", { tab: "schedules", schedule: "ais_weekly" })).toBe(
      "/app/prj_1/schedules?ai=ais_weekly",
    );
  });

  it("redirects research and keeps the keyword query", () => {
    expect(promptResearchRedirectPath("prj_1", { q: "tools" })).toBe(
      "/app/prj_1/ai-visibility?tab=research&q=tools",
    );
    expect(promptResearchRedirectPath("prj_1", { q: "tools", fresh: "1", tab: "old" })).toBe(
      "/app/prj_1/ai-visibility?tab=research&q=tools&fresh=1",
    );
    expect(brandVisibilityRedirectPath("prj_1", { q: "example.com" })).toBe(
      "/app/prj_1/ai-visibility?tab=research&q=example.com",
    );
  });
});
