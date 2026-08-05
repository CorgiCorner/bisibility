import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/nextjs-vite";
import type { Plugin } from "vite";

const runtimeStubs = fileURLToPath(new URL("./browser-runtime-stubs.tsx", import.meta.url));
const prismaRuntimeStub = fileURLToPath(new URL("./prisma-runtime-stub.ts", import.meta.url));
const imageStub = fileURLToPath(new URL("./next-image-stub.tsx", import.meta.url));
const fontStub = fileURLToPath(new URL("./next-font-stub.ts", import.meta.url));
const serverActionAliases = [
  "@/app/app/account/actions",
  "@/app/app/account/preferences/actions",
  "@/app/app/settings/actions",
  "@/app/cloud/import/actions",
  "@/app/onboarding/actions",
  "@/lib/actions/_shared",
  "@/lib/actions/account",
  "@/lib/actions/alert-feed",
  "@/lib/actions/alerts",
  "@/lib/actions/apiKey",
  "@/lib/actions/cloud",
  "@/lib/actions/competitors",
  "@/lib/actions/keyword",
  "@/lib/actions/keyword-import-export",
  "@/lib/actions/instance-migration",
  "@/lib/actions/notification-prefs",
  "@/lib/actions/notifications",
  "@/lib/actions/project",
  "@/lib/actions/providers",
  "@/lib/actions/rankCheck",
  "@/lib/actions/saved-views",
  "@/lib/actions/sample-data",
  "@/lib/actions/schedule",
  "@/lib/actions/settings",
  "@/lib/actions/slack",
  "@/lib/actions/tags",
  "@/lib/actions/team",
  "@/lib/actions/traffic-sync",
  "@/lib/actions/waitlist",
  "@/lib/actions/workspace",
];
const serverActionPattern =
  /^@\/(?:app\/(?:app\/(?:account(?:\/preferences)?|settings)|cloud\/import|onboarding)\/actions|lib\/actions\/(?:_shared|account|alert-feed|alerts|apiKey|cloud|competitors|keyword|keyword-import-export|instance-migration|notification-prefs|notifications|project|providers|rankCheck|saved-views|sample-data|schedule|settings|slack|tags|team|traffic-sync|waitlist|workspace))$/;
const runtimeStubPatterns = [
  /^@\/components\/shell\/keyword-search$/,
  /^@\/lib\/api\/ratelimit$/,
  /^@\/lib\/auth\/(auth|client|otp-resend|session)$/,
  /^@\/lib\/redis$/,
  /[\\/]components[\\/]shell[\\/]keyword-search\.ts$/,
  /[\\/]lib[\\/]api[\\/]ratelimit\.ts$/,
  /[\\/]lib[\\/]auth[\\/](auth|client|otp-resend|session)\.ts$/,
  /[\\/]lib[\\/]redis\.ts$/,
];
const prismaRuntimeStubPatterns = [
  /^@\/lib\/db\/prisma$/,
  /^@\/lib\/generated\/prisma\/client$/,
  /[\\/]lib[\\/]db[\\/]prisma\.ts$/,
  /[\\/]lib[\\/]generated[\\/]prisma[\\/]client\.ts$/,
];
const nodeRuntimeStubPattern = /^node:(async_hooks|crypto|dns\/promises|net|tls)$/;

const runtimeAliases = {
  ...Object.fromEntries(serverActionAliases.map((name) => [name, runtimeStubs])),
  "@/components/shell/keyword-search": runtimeStubs,
  "@/lib/auth/auth": runtimeStubs,
  "@/lib/auth/client": runtimeStubs,
  "@/lib/auth/otp-resend": runtimeStubs,
  "@/lib/api/ratelimit": runtimeStubs,
  "@/lib/auth/session": runtimeStubs,
  "@/lib/db/prisma": prismaRuntimeStub,
  "@/lib/generated/prisma/client": prismaRuntimeStub,
  "@/lib/redis/redis": runtimeStubs,
  "@/lib/queries/notifications": runtimeStubs,
  "@upstash/ratelimit": runtimeStubs,
  "@upstash/redis": runtimeStubs,
  "@grpc/grpc-js": runtimeStubs,
  "@temporalio/activity": runtimeStubs,
  "@temporalio/client": runtimeStubs,
  "@temporalio/common": runtimeStubs,
  "@temporalio/worker": runtimeStubs,
  "@temporalio/workflow": runtimeStubs,
  async_hooks: runtimeStubs,
  "client-only": runtimeStubs,
  crypto: runtimeStubs,
  "geist/font/mono": fontStub,
  "geist/font/sans": fontStub,
  net: runtimeStubs,
  "next/cache": runtimeStubs,
  "next/font/google": fontStub,
  "next/font/local": fontStub,
  "next/headers": runtimeStubs,
  "next/image": imageStub,
  "next/link": runtimeStubs,
  "next/navigation": runtimeStubs,
  "node:async_hooks": runtimeStubs,
  "node:crypto": runtimeStubs,
  "node:dns/promises": runtimeStubs,
  "node:net": runtimeStubs,
  "node:tls": runtimeStubs,
  redis: runtimeStubs,
  "server-only": runtimeStubs,
  tls: runtimeStubs,
};

function candidateModuleIds(source: string, importer?: string): string[] {
  const cleanSource = source.split("?", 1)[0];
  if (!(importer && cleanSource.startsWith("."))) {
    return [cleanSource];
  }

  const importerPath = importer.split("?", 1)[0];
  const absoluteSource = resolve(dirname(importerPath), cleanSource);
  return [cleanSource, absoluteSource, `${absoluteSource}.ts`, `${absoluteSource}.tsx`];
}

function matchesAny(patterns: RegExp[], candidates: string[]): boolean {
  return patterns.some((pattern) => candidates.some((candidate) => pattern.test(candidate)));
}

const runtimeStubPlugin = {
  name: "storybook-runtime-stubs",
  enforce: "pre",
  resolveId(source, importer) {
    const candidates = candidateModuleIds(source, importer);

    if (
      serverActionPattern.test(source) ||
      nodeRuntimeStubPattern.test(source) ||
      matchesAny(runtimeStubPatterns, candidates)
    ) {
      return runtimeStubs;
    }

    if (matchesAny(prismaRuntimeStubPatterns, candidates)) {
      return prismaRuntimeStub;
    }

    return null;
  },
} satisfies Plugin;

const config: StorybookConfig = {
  stories: ["../components/**/*.stories.@(ts|tsx)"],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  viteFinal: async (viteConfig) => {
    viteConfig.resolve ??= {};
    const existingAliases = viteConfig.resolve.alias;
    viteConfig.resolve.alias = Array.isArray(existingAliases)
      ? [
          ...Object.entries(runtimeAliases).map(([find, replacement]) => ({
            find,
            replacement,
          })),
          ...existingAliases,
        ]
      : { ...(existingAliases ?? {}), ...runtimeAliases };
    viteConfig.plugins = [runtimeStubPlugin, ...(viteConfig.plugins ?? [])];

    return viteConfig;
  },
};

export default config;
