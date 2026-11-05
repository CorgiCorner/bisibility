/// <reference types="vite/client" />

import {
  runOpsSweepNow,
  sendTestSlackNotification,
  setDomainRatingTracking,
} from "@/.storybook/browser-runtime-stubs";
import { describe, expect, it, vi } from "vitest";

type StoryModule = {
  default?: unknown;
  [key: string]: unknown;
};

const storyModules: Array<[string, () => Promise<StoryModule>]> = Object.entries(
  import.meta.glob("../components/**/*.stories.tsx") as Record<string, () => Promise<StoryModule>>,
).sort(([left], [right]) => left.localeCompare(right));

const ignoredExports = new Set(["__esModule", "default"]);

function storyExportNames(module: StoryModule) {
  return Object.keys(module).filter((name) => !ignoredExports.has(name) && /^[A-Z]/.test(name));
}

describe("storybook stories", () => {
  it("fails closed for server actions without a network request", async () => {
    const fetchSpy = vi.spyOn(window, "fetch");
    try {
      for (const action of [runOpsSweepNow, sendTestSlackNotification, setDomainRatingTracking]) {
        await expect(action()).rejects.toThrow("Action unavailable in Storybook preview");
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
  // Import checks do not render or mutate the shared canvas; keep play tests sequential.
  it.concurrent.each(storyModules)("%s imports cleanly", async (_path, loadStoryModule) => {
    const module = await loadStoryModule();

    expect(module.default).toBeTruthy();
    expect(storyExportNames(module).length).toBeGreaterThan(0);
  });
});
