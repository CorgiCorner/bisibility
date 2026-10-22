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
  "@/lib/queries/check-schedule-list": "exports.listCheckScheduleRows = async () => [{ blocked: false, cronExpression: '0 6 * * 5', dayOfMonth: null, enabled: true, frequency: 'weekly', isDefault: true, jitterMinutes: 15, keywordCount: 2, memberDeviceCount: 1, memberMarketCount: 1, name: 'Friday 06:00', perRunCents: 24, publicId: 'sch_friday', serpDepth: null, sharedTag: null, targetCount: 2, timeOfDay: '06:00', timezone: 'Europe/Warsaw', weekday: 'Friday' }];",
  "@/components/project-runs/ProjectRunsTabs": "exports.ProjectRunsTabs = () => null;",
  "@/components/i18n/FeatureMessagesProvider": "const ref = registerClientReference({}, 'intl-provider-client', 'NextIntlClientProvider'); exports.FeatureMessagesProvider = ({ children, ...props }) => React.createElement(ref, props, children);",
  "@/components/shell/PageContent": "exports.PageContent = ({ children }) => children;",
  "@/components/schedules/SchedulesWorkspace":
    "const ref = registerClientReference({}, 'schedules-workspace-client', 'SchedulesWorkspace'); exports.SchedulesWorkspace = process.argv[2] === 'true' ? (props) => React.createElement(ref, { ...props, onUnsafe: () => {} }) : ref;",
  "@/i18n/catalog-loader.server": "exports.loadCoreMessages = async () => ({ shared: {}, projectRuns: { rscCatalogSentinel: 'schedules-catalog' }, projectAiTracking: {} });",
  "@/i18n/document-locale.server": "exports.resolveRegionalDocumentLocale = async () => ({ locale: 'en', timeZone: 'Pacific/Chatham' });",
  "@/lib/actions/ai-tracking": "exports.getAiTrackingScheduleList = async () => ({ canWrite: true, activePromptIds: ['aip_one'], schedules: [{ id: 'ais_weekly', promptIds: ['aip_one'], configurations: [], archivedAt: null, nextRunAt: null }] });",
  "next/navigation": "exports.unstable_rethrow = () => {};",
  "@/lib/auth/authorize": "exports.getProjectRole = () => 'owner';",
  "@/lib/auth/capabilities": "exports.canProjectAction = () => true;",
  "@/lib/queries/_auth":
    "exports.resolveProjectAccess = async () => ({ publicId: 'prj_1' }); exports.requireReadableProject = async () => ({ actor: {}, project: { id: 'project_1' } });",
  "@/lib/queries/check-schedule-members":
    "exports.listScheduleMemberCandidates = async () => [{ device: 'Mobile', market: 'Poland', name: 'candidate keyword', publicId: 'kw_candidate', scheduleId: null, sourceName: null, tags: [], targetCount: 1 }];",
  "@/lib/queries/rank-check-runs":
    "exports.listRankCheckRuns = async () => ({ data: [], nextCursor: null });",
  "@/lib/schedules/planning-visibility": "exports.schedulePlanningMinutes = () => 15;",
  "@/lib/routing/app-path":
    "exports.appPath = (projectRef, ...segments) => '/app/' + projectRef + '/' + segments.join('/'); exports.asProjectRef = (projectRef) => projectRef;",
  "@/lib/routing/project-schedules-path":
    "exports.projectSchedulesPath = (projectRef, scheduleId) => '/app/' + projectRef + '/runs/schedules/' + scheduleId;",
  "next/link": "module.exports = ({ children, ...props }) => React.createElement('a', props, children);",
};

async function main() {
  if (process.argv[1]) delete stubs[process.argv[1]];
  const root = process.cwd();
  const page = path.join(root, "app/(regional)/app/(workspace)/[project]/runs/schedules/page.tsx");
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
        build.onResolve({ filter: /^next\/(link|navigation)$/ }, (args) => ({ namespace: "stub", path: args.path }));
        build.onLoad({ filter: /.*/, namespace: "stub" }, (args) => {
          if (!(args.path in stubs)) throw new Error("Missing RSC boundary stub: " + args.path);
          return { contents: stubs[args.path], loader: "tsx" };
        });
      },
    }],
    write: false,
  });
  const pageModule = new Module(page);
  pageModule.filename = page;
  pageModule.paths = Module._nodeModulePaths(root);
  pageModule._compile(result.outputFiles[0].text, page);
  const element = await pageModule.exports.default({ params: Promise.resolve({ project: "prj_1" }), searchParams: Promise.resolve({ ai: "ais_weekly" }) });
  const errors = [];
  const stream = renderToReadableStream(element, {
    "schedules-workspace-client": { async: false, chunks: [], id: "schedules-workspace-client", name: "SchedulesWorkspace" },
    "intl-provider-client": { async: false, chunks: [], id: "intl-provider-client", name: "NextIntlClientProvider" },
  }, { onError: (error) => { errors.push(error); } });
  const reader = stream.getReader();
  let payload = "";
  const decoder = new TextDecoder();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    payload += decoder.decode(chunk.value, { stream: true });
  }
  if (errors.length) throw errors[0];
  process.stdout.write(payload);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;

function renderSchedulesPageThroughRsc(omitStub = "", invalidClientProps = false) {
  return execFileSync(
    process.execPath,
    ["--conditions=react-server", "--eval", rscGuard, omitStub, String(invalidClientProps)],
    {
      cwd: process.cwd(),
      stdio: "pipe",
      encoding: "utf8",
    },
  );
}

describe("SchedulesPage RSC boundary", () => {
  it("serializes the common schedules workspace, AI data and message boundary", () => {
    const payload = renderSchedulesPageThroughRsc();
    expect(payload).toContain("schedules-workspace-client");
    expect(payload).toContain("intl-provider-client");
    expect(payload).toContain("Pacific/Chatham");
    expect(payload).toContain("schedules-catalog");
    expect(payload).toContain("Friday 06:00");
    expect(payload).toContain("ais_weekly");
    expect(payload).toContain("aip_one");
    expect(payload).toContain('"aiUnavailable":false');
    expect(payload).toContain("kw_candidate");
    expect(payload).toContain('"planningMinutes":15');
  });

  it("names a missing boundary fixture instead of silently supplying an empty module", () => {
    expect(() =>
      renderSchedulesPageThroughRsc("@/components/schedules/SchedulesWorkspace"),
    ).toThrow("Missing RSC boundary stub: @/components/schedules/SchedulesWorkspace");
  });

  it("rejects a function accidentally crossing the actual RSC client boundary", () => {
    expect(() => renderSchedulesPageThroughRsc("", true)).toThrow(
      /Event handlers cannot be passed/,
    );
  });
});
