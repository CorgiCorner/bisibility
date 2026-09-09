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
          errors: [{ text: "Server-only module reached the schedules browser bundle." }],
        }));
      },
    },
  ],
  write: false,
};

describe("SchedulesList client boundary", () => {
  it("bundles the list and archive form without server runtime modules", async () => {
    const result = await build({
      ...browserBuild,
      entryPoints: [
        "components/schedules/SchedulesList.tsx",
        "components/schedules/ArchiveScheduleModal.tsx",
      ],
    });

    expect(Object.keys(result.metafile?.inputs ?? {})).not.toContain(
      "lib/deployment/runtime-env.generated.ts",
    );
  });

  it("rejects importing the provider-backed server schema into a client form", async () => {
    await expect(
      build({
        ...browserBuild,
        stdin: {
          contents: `export { createCheckScheduleSchema } from "@/lib/schemas/check-schedule";`,
          loader: "ts",
          resolveDir: process.cwd(),
          sourcefile: "schedule-form-regression.ts",
        },
      }),
    ).rejects.toThrow("Server-only module reached the schedules browser bundle.");
  });
});
