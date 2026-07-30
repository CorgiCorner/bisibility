/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";

type StoryModule = {
  default?: unknown;
  [key: string]: unknown;
};

const storyModules: Array<[string, () => Promise<StoryModule>]> = Object.entries(
  import.meta.glob<StoryModule>("../components/**/*.stories.tsx"),
).sort(([left], [right]) => left.localeCompare(right));

const ignoredExports = new Set(["__esModule", "default"]);

function storyExportNames(module: StoryModule) {
  return Object.keys(module).filter((name) => !ignoredExports.has(name) && /^[A-Z]/.test(name));
}

describe("storybook stories", () => {
  it.each(storyModules)("%s imports cleanly", async (_path, loadStoryModule) => {
    const module = await loadStoryModule();

    expect(module.default).toBeTruthy();
    expect(storyExportNames(module).length).toBeGreaterThan(0);
  });
});
