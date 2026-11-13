import { describe, expect, it } from "vitest";
import {
  aiVisibilityTabOrder,
  aiVisibilityTabs,
  defaultAiVisibilityTab,
  resolveAiVisibilityTab,
  trackingViewFromQuery,
} from "./ai-visibility-tabs";

describe("AI Visibility tabs", () => {
  it("registers overview, prompts, research, sources and engines in the final tab order", () => {
    const ids = aiVisibilityTabs.map((tab) => tab.id);
    expect(ids).toEqual(["overview", "prompts", "research", "sources", "engines"]);
    expect(aiVisibilityTabs.some((tab) => tab.id === "engines")).toBe(true);
    const positions = ids.map((id) => aiVisibilityTabOrder.indexOf(id));
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(aiVisibilityTabOrder).toEqual(["overview", "prompts", "research", "sources", "engines"]);
  });

  it("defaults to overview", () => {
    expect(defaultAiVisibilityTab()).toBe("overview");
  });

  it("falls back to overview for an unknown value", () => {
    expect(resolveAiVisibilityTab(undefined)).toBe("overview");
    expect(resolveAiVisibilityTab("")).toBe("overview");
    expect(resolveAiVisibilityTab("overview")).toBe("overview");
    expect(resolveAiVisibilityTab("sources")).toBe("sources");
    expect(resolveAiVisibilityTab("runs")).toBe("overview");
    expect(resolveAiVisibilityTab("research")).toBe("research");
    expect(resolveAiVisibilityTab("prompts")).toBe("prompts");
    expect(resolveAiVisibilityTab("engines")).toBe("engines");
  });

  it("keeps the tracker view off the module tab parameter", () => {
    expect(trackingViewFromQuery("runs")).toBe("runs");
    expect(trackingViewFromQuery("prompts")).toBe("prompts");
    expect(trackingViewFromQuery("schedules")).toBe("prompts");
    expect(trackingViewFromQuery(undefined)).toBe("prompts");
  });
});
