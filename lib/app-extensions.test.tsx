import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { appExtensions, plausibleScriptConfig } from "./app-extensions";

const originalDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
const originalUrl = process.env.NEXT_PUBLIC_PLAUSIBLE_URL;

afterEach(() => {
  if (originalDomain === undefined) delete process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  else process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN = originalDomain;

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
