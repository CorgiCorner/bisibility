import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { appExtensions, plausibleScriptConfig } from "./app-extensions";

const originalDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
const originalQuizFlag = process.env.ONBOARDING_QUIZ_ENABLED;
const originalUrl = process.env.NEXT_PUBLIC_PLAUSIBLE_URL;

function readSnapshotRegistrySource() {
  const adapterDirectory = ["public", "overrides"].join("-");
  const adapterPath = path.join(
    __dirname,
    "../scripts/release",
    adapterDirectory,
    "lib/app-extensions.tsx",
  );
  const registryPath = fs.existsSync(adapterPath)
    ? adapterPath
    : path.join(__dirname, "app-extensions.tsx");
  return fs.readFileSync(registryPath, "utf8");
}

afterEach(() => {
  if (originalDomain === undefined) delete process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  else process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN = originalDomain;

  if (originalQuizFlag === undefined) delete process.env.ONBOARDING_QUIZ_ENABLED;
  else process.env.ONBOARDING_QUIZ_ENABLED = originalQuizFlag;

  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_PLAUSIBLE_URL;
  else process.env.NEXT_PUBLIC_PLAUSIBLE_URL = originalUrl;
});

describe("Plausible head extension", () => {
  it("stays disabled unless both public settings are present", () => {
    delete process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
    process.env.NEXT_PUBLIC_PLAUSIBLE_URL = "https://analytics.example.com";

    expect(plausibleScriptConfig()).toBeNull();
    expect(appExtensions.renderHead()).toBeNull();
  });

  it("renders the self-hosted tracker with a normalized URL", () => {
    process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN = " example.com ";
    process.env.NEXT_PUBLIC_PLAUSIBLE_URL = "https://analytics.example.com/";

    const markup = renderToStaticMarkup(appExtensions.renderHead());

    expect(markup).toContain('data-domain="example.com"');
    expect(markup).toContain('src="https://analytics.example.com/js/script.js"');
  });

  it("rejects non-http tracker URLs", () => {
    process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN = "example.com";
    process.env.NEXT_PUBLIC_PLAUSIBLE_URL = "javascript:alert(1)";

    expect(plausibleScriptConfig()).toBeNull();
  });
});

describe("app extension registry", () => {
  it("preserves the exact private and public registry shape", () => {
    const expectedKeys = ["renderHead", "renderSupportWidget", "renderOnboardingQuizSlot"];
    const publicRegistryBody = readSnapshotRegistrySource().match(
      /export const appExtensions = \{(?<body>[\s\S]*?)\};/,
    )?.groups?.body;

    expect(Object.keys(appExtensions)).toEqual(expectedKeys);
    expect(publicRegistryBody?.match(/\b[a-z]\w*/g)).toEqual(expectedKeys);
  });

  it("delegates the private quiz slot to its adapter", async () => {
    process.env.ONBOARDING_QUIZ_ENABLED = "off";

    const child = <div data-shell="">Nested</div>;
    const result = await appExtensions.renderOnboardingQuizSlot(child);
    const markup = renderToStaticMarkup(result);

    expect(markup).toBe('<div data-shell="">Nested</div>');
    expect(markup).not.toContain("data-app-modal-background");
    expect(appExtensions.renderOnboardingQuizSlot.name).toBe("renderOnboardingQuizSlot");
  });

  it("keeps the public quiz slot inert and free of private quiz imports", () => {
    const publicSource = readSnapshotRegistrySource();
    const importedModules = [
      ...publicSource.matchAll(/import(?:\s+type)?(?:\s+\{[^}]*\}\s+from)?\s+"([^"]+)";/g),
    ].map((match) => match[1]);

    expect(importedModules).toEqual(["@/lib/deployment/runtime-env.generated", "react"]);
    expect(publicSource).toMatch(
      /async function renderOnboardingQuizSlot\(children: ReactNode\): Promise<ReactNode> \{\s+return children;\s+\}/,
    );
  });
});
