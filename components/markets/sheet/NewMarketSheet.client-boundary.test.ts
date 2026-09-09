import { type BuildOptions, build } from "esbuild";
import { describe, expect, it } from "vitest";

const browserBuild: BuildOptions = {
  bundle: true,
  format: "esm",
  logLevel: "silent",
  metafile: true,
  outdir: "test-output",
  packages: "external",
  platform: "browser",
  plugins: [
    {
      name: "reject-server-only",
      setup(builder) {
        builder.onResolve({ filter: /^server-only$/ }, () => ({
          errors: [{ text: "Server-only module reached the market drawer browser bundle." }],
        }));
      },
    },
  ],
  write: false,
};

describe("NewMarketSheet client boundary", () => {
  it("bundles the market drawer and embedded schedule editor without server runtime modules", async () => {
    const result = await build({
      ...browserBuild,
      entryPoints: [
        "components/markets/sheet/NewMarketSheet.tsx",
        "components/markets/sheet/NewMarketCreator.tsx",
        "components/markets/sheet/NewMarketScheduleEditor.tsx",
      ],
    });

    expect(Object.keys(result.metafile?.inputs ?? {})).not.toContain(
      "lib/deployment/runtime-env.generated.ts",
    );
  });

  it("rejects the server schedule-context import that caused the Next compilation failure", async () => {
    await expect(
      build({
        ...browserBuild,
        stdin: {
          contents: `import { marketScheduleContext } from "@/lib/markets/schedule-context";
            export const context = marketScheduleContext({ checkSchedules: [], defaults: null, providerConnections: [] });`,
          loader: "tsx",
          resolveDir: process.cwd(),
          sourcefile: "market-drawer-regression.tsx",
        },
      }),
    ).rejects.toThrow("Server-only module reached the market drawer browser bundle.");
  });
});
