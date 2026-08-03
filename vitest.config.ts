import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

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
  { find: /^@\/lib\/actions\/.+/, replacement: browserStubs },
  { find: "@/lib/api/ratelimit", replacement: browserStubs },
  { find: "@/lib/auth/auth", replacement: browserStubs },
  { find: "@/lib/auth/client", replacement: browserStubs },
  { find: "@/lib/auth/otp-resend", replacement: browserStubs },
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

export default defineConfig({
  test: {
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
      {
        // Use the automatic JSX runtime so component tests don't need React in scope.
        oxc: { jsx: { runtime: "automatic" } },
        resolve: {
          // Next.js "server-only"/"client-only" guards throw outside RSC/CSR; stub them in unit tests.
          // Mirror the tsconfig "@/*" path alias so component tests can import via "@/...".
          alias: baseTestAliases,
        },
        ssr: {
          // MUI X v8 packages ship ESM that must be transformed so their MUI subpath imports resolve in jsdom.
          noExternal: ["@mui/x-charts", "@mui/x-data-grid"],
        },
        test: {
          name: "unit",
          environment: "jsdom",
          globals: true,
          include: [
            "app/**/*.test.{ts,tsx}",
            "components/**/*.test.{ts,tsx}",
            "lib/**/*.test.{ts,tsx}",
          ],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
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
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
          include: ["tests/storybook-imports.browser.test.ts"],
        },
      },
      {
        resolve: { alias: baseTestAliases },
        test: {
          name: "release-guardrails",
          environment: "node",
          include: ["scripts/**/*.test.ts"],
          testTimeout: 30_000,
        },
      },
    ],
  },
});
