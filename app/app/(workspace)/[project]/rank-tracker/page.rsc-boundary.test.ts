import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const rscGuard = String.raw`
const Module = require("node:module");
const path = require("node:path");
const esbuild = require("esbuild");
const React = require("react");
const {
  registerClientReference,
  renderToReadableStream,
} = require("next/dist/compiled/react-server-dom-turbopack/server.node");

const stubs = {
  "@/components/rank-runs/RankTrackerRunsTab":
    "const RunsSection = registerClientReference({}, 'runs-section-client', 'RunsSection'); exports.RankTrackerRunsTab = ({ projectRef }) => React.createElement(RunsSection, { projectRef });",
  "@/lib/queries/_auth":
    "const projectRef = process.env.RSC_INVALID === '1' ? () => 'prj_1' : 'prj_1'; exports.resolveProjectAccess = async () => ({ projectId: 'project_1', publicId: projectRef });",
  "next/navigation": "exports.redirect = () => {};",
};

async function main() {
  const root = process.cwd();
  const page = path.join(root, "app/app/(workspace)/[project]/rank-tracker/page.tsx");
  const result = await esbuild.build({
    bundle: true,
    entryPoints: [page],
    external: [
      "next/dist/compiled/react-server-dom-turbopack/server.node",
      "react",
      "react/jsx-runtime",
    ],
    format: "cjs",
    platform: "node",
    plugins: [{
      name: "rsc-boundary-stubs",
      setup(build) {
        build.onResolve({ filter: /^@\// }, (args) => ({ namespace: "stub", path: args.path }));
        build.onResolve({ filter: /^next\/navigation$/ }, () => ({ namespace: "stub", path: "next/navigation" }));
        build.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({
          contents: stubs[args.path] ?? "module.exports = {};",
          loader: "tsx",
        }));
      },
    }],
    write: false,
  });
  const pageModule = new Module(page);
  pageModule.filename = page;
  pageModule.paths = Module._nodeModulePaths(root);
  pageModule._compile(result.outputFiles[0].text, page);
  const element = await pageModule.exports.default({
    params: Promise.resolve({ project: "prj_1" }),
    searchParams: Promise.resolve({ tab: "runs" }),
  });
  const errors = [];
  const stream = renderToReadableStream(
    element,
    {
      "runs-section-client": {
        async: false,
        chunks: [],
        id: "runs-section-client",
        name: "RunsSection",
      },
    },
    {
      onError: (error) => {
        errors.push(error);
      },
    },
  );
  const reader = stream.getReader();
  while (!(await reader.read()).done) {}
  if (errors.length) throw errors[0];
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;

function renderRankTrackerRunsPageThroughRsc(invalidProjectRef = false) {
  execFileSync(process.execPath, ["--conditions=react-server", "--eval", rscGuard], {
    cwd: process.cwd(),
    env: { ...process.env, RSC_INVALID: invalidProjectRef ? "1" : "0" },
    stdio: "pipe",
  });
}

function invalidProjectRefFailure() {
  try {
    renderRankTrackerRunsPageThroughRsc(true);
  } catch (error) {
    return String((error as { stderr?: Buffer }).stderr ?? "");
  }
  return "";
}

describe("RankTrackerPage Runs RSC boundary", () => {
  it("serializes its RunsSection client props", () => {
    expect(renderRankTrackerRunsPageThroughRsc).not.toThrow();
  });

  it("rejects a function passed through projectRef", () => {
    expect(invalidProjectRefFailure()).toContain(
      "Functions cannot be passed directly to Client Components",
    );
  });
});
