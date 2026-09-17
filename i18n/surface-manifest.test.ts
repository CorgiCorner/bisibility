import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { i18nSurfaceManifest } from "./surface-manifest";
import uiSurfaceRegistry from "./ui-surface-registry.json" with { type: "json" };

describe("i18n surface manifest", () => {
  it("derives the incremental inventory from the exact source registry", async () => {
    await Promise.all(
      i18nSurfaceManifest.foundationSources.map((source) => stat(resolve(process.cwd(), source))),
    );

    expect(i18nSurfaceManifest.initialMarketing).toEqual([
      "home",
      "integrations",
      "pricing",
      "faq",
      "cost-calculator",
    ]);
    expect(i18nSurfaceManifest.scope.kind).toBe("core");
    expect(i18nSurfaceManifest.scope.application.routeRoot).toBe("app/(regional)");
    expect(i18nSurfaceManifest.registry.completedSourceCount).toBe(
      uiSurfaceRegistry.sources.filter(
        (source) => source.status === "migrated" || source.status === "excluded",
      ).length,
    );
    expect(i18nSurfaceManifest.registry.pendingSourceCount).toBe(
      uiSurfaceRegistry.sources.filter((source) => source.status === "pending").length,
    );
  });
});
