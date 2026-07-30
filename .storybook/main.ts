import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/nextjs";
import webpack from "webpack";

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

const config: StorybookConfig = {
  stories: ["../components/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-essentials"],
  framework: {
    name: "@storybook/nextjs",
    options: {},
  },
  core: {
    builder: {
      name: "@storybook/builder-webpack5",
      options: {
        fsCache: false,
      },
    },
  },
  docs: {
    autodocs: "tag",
  },
  webpackFinal: async (webpackConfig) => {
    webpackConfig.resolve ??= {};
    webpackConfig.resolve.alias = {
      ...(webpackConfig.resolve.alias ?? {}),
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
      crypto: runtimeStubs,
      "geist/font/mono": fontStub,
      "geist/font/sans": fontStub,
      async_hooks: runtimeStubs,
      net: runtimeStubs,
      "node:async_hooks": runtimeStubs,
      "node:crypto": runtimeStubs,
      "node:dns/promises": runtimeStubs,
      "node:net": runtimeStubs,
      "next/cache": runtimeStubs,
      "next/font/google": fontStub,
      "next/font/local": fontStub,
      "next/headers": runtimeStubs,
      "next/image": imageStub,
      "next/link": runtimeStubs,
      "next/navigation": runtimeStubs,
      redis: runtimeStubs,
      "server-only": runtimeStubs,
      "client-only": runtimeStubs,
    };
    webpackConfig.resolve.fallback = {
      ...(webpackConfig.resolve.fallback ?? {}),
      crypto: false,
      net: false,
      tls: false,
    };
    webpackConfig.performance = {
      ...(webpackConfig.performance ?? {}),
      hints: false,
    };
    webpackConfig.plugins ??= [];
    webpackConfig.plugins.push(
      new webpack.NormalModuleReplacementPlugin(serverActionPattern, runtimeStubs),
    );
    for (const pattern of runtimeStubPatterns) {
      webpackConfig.plugins.push(new webpack.NormalModuleReplacementPlugin(pattern, runtimeStubs));
    }
    for (const pattern of prismaRuntimeStubPatterns) {
      webpackConfig.plugins.push(
        new webpack.NormalModuleReplacementPlugin(pattern, prismaRuntimeStub),
      );
    }
    webpackConfig.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^node:(async_hooks|crypto|net)$/, runtimeStubs),
      new webpack.NormalModuleReplacementPlugin(/^node:dns\/promises$/, runtimeStubs),
    );

    return webpackConfig;
  },
};

export default config;
