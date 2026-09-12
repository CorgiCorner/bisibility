import { isBuiltin } from "node:module";
import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { testModuleCache } from "./vitest.module-cache";
import { nodeRenderTests } from "./vitest.node-render-tests";

const emptyModule = fileURLToPath(new URL("./vitest.empty.ts", import.meta.url));
const rootDir = fileURLToPath(new URL("./", import.meta.url));
const marketingContentDir = fileURLToPath(
  new URL("./components/marketing/content/", import.meta.url),
);
const browserImageStub = fileURLToPath(
  new URL("./.storybook/next-image-stub.tsx", import.meta.url),
);
const browserStubs = fileURLToPath(
  new URL("./.storybook/browser-runtime-stubs.tsx", import.meta.url),
);
const baseTestAliases = [
  { find: "client-only", replacement: emptyModule },
  { find: "server-only", replacement: emptyModule },
  { find: /^@\/components\/content\//, replacement: marketingContentDir },
  { find: /^@\//, replacement: rootDir },
];
const browserTestAliases = [
  {
    find: "@/lib/actions/provider-allocation",
    replacement: fileURLToPath(
      new URL("./.storybook/provider-allocation-stubs.ts", import.meta.url),
    ),
  },
  {
    find: "@/lib/actions/competitor-set-input",
    replacement: fileURLToPath(new URL("./lib/actions/competitor-set-input.ts", import.meta.url)),
  },
  { find: /^@\/lib\/actions\/.+/, replacement: browserStubs },
  { find: "@/lib/api/ratelimit", replacement: browserStubs },
  { find: "@/lib/auth/auth", replacement: browserStubs },
  { find: "@/lib/auth/client", replacement: browserStubs },
  { find: "@/lib/auth/otp-resend", replacement: browserStubs },
  { find: "@/lib/auth/request-login-code", replacement: browserStubs },
  { find: "@/lib/auth/session", replacement: browserStubs },
  { find: "@/lib/redis/redis", replacement: browserStubs },
  { find: "@/lib/queries/notifications", replacement: browserStubs },
  { find: "@/components/shell/keyword-search", replacement: browserStubs },
  { find: "next/cache", replacement: browserStubs },
  { find: "next/headers", replacement: browserStubs },
  { find: "next/image", replacement: browserImageStub },
  { find: "next/link", replacement: browserStubs },
  { find: "next/navigation", replacement: browserStubs },
  ...baseTestAliases,
];

const nodeUnitIncludes = [
  "app/**/*.test.ts",
  "app/api/**/*.test.tsx",
  "components/**/*.test.ts",
  "lib/**/*.test.ts",
];
const domUnitTests = [
  "lib/keyword-research/default-scope.characterization.test.ts",
  "app/onboarding/actions.test.ts",
  "components/rank-runs/notice-dismissals.test.ts",
  "components/cloud/use-cloud-import-job.test.ts",
  "components/cloud/workspace-package-download.test.ts",
  "components/shell/command-palette-groups.test.ts",
  "components/marketing/pricing/pricing-vote-analytics.test.ts",
  "components/overview/data-source-status.test.ts",
  "components/keywords/use-rank-check-poll.test.ts",
  "components/keywords/KeywordIndexStatus.test.ts",
  "components/keywords/use-first-check-flow.test.ts",
  "components/keywords/location-picker-data.test.ts",
  "components/keywords/grid/grid-density.test.ts",
  "lib/analytics/client.test.ts",
  "lib/auth/session-hint.test.ts",
  "lib/content/content-feature-status.test.ts",
  "lib/integrations/analytics/posthog/client.test.ts",
  "lib/integrations/analytics/posthog/config.test.ts",
  "lib/notifications/useNotificationStream.test.ts",
  "lib/realtime/useAppRealtime.test.ts",
  "lib/theme/browser-theme.test.ts",
  "lib/ui/download.test.ts",
  "lib/vocabulary/guard.test.ts",
];

export default defineConfig({
  test: {
    clearMocks: false,
    // Vitest disables this in V8 coverage workers to retain precise source positions.
    env: {
      NODE_COMPILE_CACHE: fileURLToPath(
        new URL("./node_modules/.cache/vitest-node/", import.meta.url),
      ),
    },
    coverage: {
      enabled: false,
      exclude: [
        "lib/**/*.test.ts",
        "lib/**/*.test.tsx",
        "lib/**/*.stories.tsx",
        "lib/**/*.d.ts",
        "lib/**/types.ts",
        "lib/deployment/runtime-env.generated.ts",
      ],
      include: ["lib/**/*.ts", "lib/**/*.tsx"],
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      thresholds: {
        functions: 80,
        lines: 75,
        statements: 74,
      },
    },
    projects: [
      ...[
        {
          name: "unit",
          environment: "node",
          include: [...nodeUnitIncludes, ...nodeRenderTests],
          exclude: ["lib/**/*.postgres.test.ts", ...domUnitTests],
          setupFiles: ["./vitest.setup.common.ts"],
        },
        {
          name: "unit-dom",
          environment: "jsdom",
          include: [
            "app/**/*.test.tsx",
            "components/**/*.test.tsx",
            "lib/**/*.test.tsx",
            ...domUnitTests,
          ],
          exclude: [
            "app/api/**/*.test.{ts,tsx}",
            "components/**/*.browser.test.tsx",
            ...nodeRenderTests,
          ],
          setupFiles: ["./vitest.setup.ts"],
        },
      ].map((test) => ({
        extends: false,
        plugins: [testModuleCache()],
        oxc: { jsx: { runtime: "automatic" as const } },
        resolve: { alias: baseTestAliases },
        // Transform chart ESM consistently in component tests.
        ssr: { noExternal: ["recharts"] },
        test: {
          ...test,
          fsModuleCache: true,
          clearMocks: false,
          globals: true,
          pool: "forks" as const,
          isolate: true,
          deps: {
            optimizer: {
              [test.environment === "node" ? "ssr" : "client"]: {
                enabled: true,
                // jsdom also runs in Node; preserve native require for external CJS peers.
                rolldownOptions: { platform: "node" as const, external: isBuiltin },
                // Bundle shared vendor graphs once; keep application modules and mocks separate.
                include: [
                  ...(test.environment === "jsdom"
                    ? [
                        "@testing-library/jest-dom/vitest",
                        "@testing-library/react",
                        "@testing-library/user-event",
                      ]
                    : []),
                  "recharts",
                  "@radix-ui/react-dialog",
                  "@radix-ui/react-menu",
                  "@radix-ui/react-popover",
                  "@radix-ui/react-tooltip",
                  "@radix-ui/react-slider",
                ],
                exclude: ["@phosphor-icons/react", "vitest", "react", "react-dom"],
              },
            },
          },
        },
      })),
      {
        extends: false,
        // Keep the browser preview resolver aligned with Next/tsconfig imports used by stories.
        define: {
          "process.env": "{}",
        },
        oxc: { jsx: { runtime: "automatic" } },
        optimizeDeps: {
          include: ["react/jsx-dev-runtime"],
        },
        resolve: {
          alias: browserTestAliases,
        },
        test: {
          name: "storybook",
          clearMocks: false,
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
          include: [
            "tests/storybook-imports.browser.test.ts",
            "tests/data-table-stories.browser.test.tsx",
            "tests/ui-primitives*.browser.test.tsx",
            "components/marketing/landing/MarketingNav.browser.test.tsx",
          ],
        },
      },
      {
        extends: false,
        resolve: { alias: baseTestAliases },
        test: {
          name: "release-guardrails",
          clearMocks: false,
          environment: "node",
          include: ["scripts/**/*.test.ts"],
          testTimeout: 30_000,
        },
      },
      {
        extends: false,
        resolve: { alias: baseTestAliases },
        test: {
          name: "postgres-smoke",
          clearMocks: false,
          environment: "node",
          include: ["lib/**/*.postgres.test.ts"],
          testTimeout: 30_000,
        },
      },
    ],
  },
});
