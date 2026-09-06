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
  "@/components/getting-started/schedule-phrase": "exports.formatScheduledRun = () => 'stub phrase';",
  "@/lib/queries/check-schedule-list": "exports.listCheckScheduleRows = async () => [{ blocked: false, cronExpression: '0 6 * * 5', dayOfMonth: null, enabled: true, frequency: 'weekly', isDefault: true, jitterMinutes: 15, keywordCount: 2, memberMeta: '1 market x 1 device', name: 'Friday 06:00', perRunCents: 24, publicId: 'sch_friday', serpDepth: null, tagScope: null, targetCount: 2, timeOfDay: '06:00', timezone: 'Europe/Warsaw', weekday: 'Friday' }];",
  "@/components/schedules/ScheduleObjectFrame":
    "exports.ScheduleObjectFrame = ({ children }) => children;",
  "@/components/schedules/SchedulesList":
    "exports.SchedulesList = registerClientReference({}, 'schedules-list-client', 'SchedulesList');",
  "@/lib/auth/authorize": "exports.getProjectRole = () => 'owner';",
  "@/lib/auth/capabilities": "exports.canProjectAction = () => true;",
  "@/lib/queries/_auth":
    "exports.resolveProjectAccess = async () => ({ publicId: 'prj_1' }); exports.requireReadableProject = async () => ({ actor: {}, project: { id: 'project_1' } });",
  "@/lib/queries/rank-check-runs":
    "exports.listRankCheckRuns = async () => ({ data: [], nextCursor: null });",
  "@/lib/routing/app-path":
    "exports.appPath = (projectRef, ...segments) => '/app/' + projectRef + '/' + segments.join('/'); exports.asProjectRef = (projectRef) => projectRef;",
  "@/lib/routing/rank-tracker-schedules-path":
    "exports.rankTrackerSchedulesPath = (projectRef, scheduleId) => '/app/' + projectRef + '/rank-tracker/schedules/' + scheduleId;",
  "next/link": "module.exports = ({ children, ...props }) => React.createElement('a', props, children);",
};

async function main() {
  const root = process.cwd();
  const page = path.join(root, "app/app/(workspace)/[project]/rank-tracker/schedules/page.tsx");
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
        build.onResolve({ filter: /^next\/link$/ }, () => ({ namespace: "stub", path: "next/link" }));
        build.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({
          contents: stubs[args.path],
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
  const element = await pageModule.exports.default({ params: Promise.resolve({ project: "prj_1" }) });
  const errors = [];
  const stream = renderToReadableStream(element, {
    "schedules-list-client": { async: false, chunks: [], id: "schedules-list-client", name: "SchedulesList" },
  }, { onError: (error) => { errors.push(error); } });
  const reader = stream.getReader();
  while (!(await reader.read()).done) {}
  if (errors.length) throw errors[0];
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;

function renderSchedulesPageThroughRsc() {
  execFileSync(process.execPath, ["--conditions=react-server", "--eval", rscGuard], {
    cwd: process.cwd(),
    stdio: "pipe",
  });
}

describe("SchedulesPage RSC boundary", () => {
  it("serializes its SchedulesList client props", () => {
    expect(renderSchedulesPageThroughRsc).not.toThrow();
  });
});
