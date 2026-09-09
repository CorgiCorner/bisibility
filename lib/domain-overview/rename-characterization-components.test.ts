import { appendFileSync, existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

type Module = Record<string, (...args: never[]) => unknown>;

const spanishScope = {
  countryCode: "ES",
  countryName: "Spain",
  languageCode: "es",
  languageLabel: "Spanish",
  providerLocationCode: 2724,
  researchAvailable: true,
};
const englishScope = {
  ...spanishScope,
  languageCode: "en",
  languageLabel: "English",
  researchAvailable: false,
};

function asModule(value: unknown) {
  return value as Module;
}

function trace(value: unknown) {
  const json = JSON.stringify(value);
  const traceFile = process.env.DOMAIN_OVERVIEW_CHARACTERIZATION_TRACE_FILE;
  if (traceFile) appendFileSync(traceFile, `${json}\n`);
  return JSON.parse(json) as unknown;
}

function workspaceRecord(supported: unknown, url: unknown) {
  const parsed = new URL(String(url), "https://example.com");
  const scope = supported as Record<string, unknown> | null;
  return {
    supported:
      scope === null
        ? null
        : {
            countryCode: scope.countryCode,
            countryName: scope.countryName ?? scope.displayName,
            languageCode: scope.languageCode,
            languageLabel: scope.languageLabel,
            providerLocationCode: scope.providerLocationCode ?? scope.locationCode,
            researchAvailable: scope.researchAvailable,
          },
    url: {
      domain: parsed.searchParams.get("domain"),
      researchScope: parsed.searchParams.get("researchScope") ?? "ES:es",
      scope: parsed.searchParams.get("scope"),
    },
  };
}

describe("domain overview component helper characterization", () => {
  it.each([
    ["default country language", spanishScope, "ES"],
    ["non-default country language", englishScope, "ES@en"],
  ])("keyword tracking preserves the %s key", async (_name, researchScope, expectedLocation) => {
    const tracking = asModule(
      await import("../../components/domain-overview/domain-overview-keyword-tracking"),
    );
    const action = vi.fn();
    const report = {
      languageCode: researchScope.languageCode,
      locationCode: 2724,
      scope: "root",
      target: "example.com",
    };
    const rows = [
      {
        cpcCents: 12,
        difficulty: 20,
        intent: "informational",
        keyword: "scope example",
        searchVolume: 100,
      },
    ];
    const input = existsSync("lib/domain-overview/scope-options.ts")
      ? { projectId: "project_1", report, researchScope, rows }
      : {
          market: { ...researchScope, canonicalKey: expectedLocation, locationCode: 2724 },
          projectId: "project_1",
          report,
          rows,
        };
    await (tracking.saveDomainKeywords as (action: unknown, input: unknown) => Promise<unknown>)(
      action,
      input,
    );
    expect(trace(action.mock.calls[0]?.[0])).toEqual({
      languageCode: researchScope.languageCode,
      locationCode: 2724,
      projectId: "project_1",
      rows: [
        {
          cpcCents: 12,
          difficulty: 20,
          intent: "informational",
          keyword: "scope example",
          location: expectedLocation,
          searchVolume: 100,
          sourceSeed: "example.com",
          variantCount: 0,
        },
      ],
      scopeOverride: "root",
      target: "example.com",
    });
  });

  it.each([
    ["supported scope", 2840],
    ["scope without a provider key", null],
  ])("workspace helpers preserve %s", async (_name, providerLocationCode) => {
    const workspace = asModule(
      await import("../../components/domain-overview/domain-overview-workspace-model"),
    );
    const scope = { ...spanishScope, providerLocationCode };
    const supported = (workspace.supportedResearchScope ?? workspace.supportedMarket) as (
      value: unknown,
    ) => unknown;
    const selection = workspace.supportedResearchScope
      ? scope
      : { ...scope, canonicalKey: "ES", locationCode: providerLocationCode };
    const url = (workspace.reportUrl as (value: unknown) => unknown)(
      workspace.supportedResearchScope
        ? {
            domainScope: "subdomain",
            projectRef: "project_1",
            researchScope: scope,
            target: "shop.example.com",
          }
        : {
            market: selection,
            projectRef: "project_1",
            scope: "subdomain",
            target: "shop.example.com",
          },
    );
    expect(String(url)).toBe(
      workspace.supportedResearchScope
        ? "/app/project_1/domain-overview?domain=shop.example.com&researchScope=ES%3Aes&scope=subdomain"
        : "/app/project_1/domain-overview?domain=shop.example.com&market=ES&scope=subdomain",
    );
    expect(trace(workspaceRecord(supported(selection), url))).toEqual({
      supported: providerLocationCode === null ? null : { ...spanishScope, providerLocationCode },
      url: { domain: "shop.example.com", researchScope: "ES:es", scope: "subdomain" },
    });
  });
});
