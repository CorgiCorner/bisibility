import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { summarizeVisibility } from "../queries/visibility";
import { competitorShareOfVoice } from "../rank-measurements/competitor-share";
import { measurementHelpRegistry } from "./registry";
import { resolveMeasurementHelp } from "./resolve";
import { partialReport } from "./test-fixtures";

describe("versioned measurement help", () => {
  it("resolves the installed visibility emitter's own metric and version without a copied pair", () => {
    const { report } = summarizeVisibility(
      Array.from({ length: 3 }, (_, index) => ({
        id: `target-${index}`,
        current: null,
        previous: null,
        volume: null,
      })),
      { asOf: new Date("2026-10-13T12:00:00Z") },
    );
    expect(resolveMeasurementHelp(report.metricId, report.definitionVersion, report)).toMatchObject(
      {
        status: "supported",
        context: { expected: 3, measured: 0, unknown: 0, neverChecked: 3 },
      },
    );
    expect(
      resolveMeasurementHelp(report.metricId, "future-visibility-version", report),
    ).toMatchObject({
      status: "unsupported_version",
      context: {},
    });
  });

  it("matches the actual emitted metric versions without assigning metric versions to concepts", () => {
    expect(
      measurementHelpRegistry
        .filter((entry) => entry.kind === "metric")
        .map(({ metricId, definitionVersion }) => [metricId, definitionVersion]),
    ).toEqual([
      ["organic_visibility_top20", "v1"],
      ["visibility_top20", "visibility-top20-v1"],
      ["organic_top10_rate", "qualified-v1"],
      ["competitor_share_of_voice_top10", "bisibility-sov-top10-v2"],
    ]);
    expect(
      measurementHelpRegistry
        .filter((entry) => entry.kind === "concept")
        .every((entry) => entry.definitionVersion === "help-v1"),
    ).toBe(true);
  });

  it("explains the emitted competitor definition and does not substitute it for legacy versions", () => {
    const report = competitorShareOfVoice([], ["example.com"]);
    expect(
      resolveMeasurementHelp(report.metricId, report.definitionVersion, { counts: report }),
    ).toMatchObject({
      status: "supported",
      context: { expected: 0, measured: 0, unknown: 0, stale: 0 },
    });
    expect(
      resolveMeasurementHelp(report.metricId, "bisibility-sov-top10-v1", { counts: report }),
    ).toMatchObject({ status: "unsupported_version", context: {} });
  });

  it.each(["en", "pl", "es-ES", "ja"])(
    "has translated text for every registered version in %s",
    (locale) => {
      const catalog = JSON.parse(
        readFileSync(new URL(`../../messages/core/${locale}/shared.json`, import.meta.url), "utf8"),
      );
      for (const entry of measurementHelpRegistry) {
        for (const key of [
          entry.titleKey,
          entry.shortDefinitionKey,
          entry.interpretationKey,
          entry.limitationKey,
        ]) {
          const text = key
            .split(".")
            .reduce((value, part) => value?.[part], catalog.shared.measurementHelp);
          expect(typeof text, `${locale}: ${key}`).toBe("string");
          expect(text.length, `${locale}: ${key}`).toBeGreaterThan(0);
        }
      }
    },
  );

  it("links every registered explanation to an existing glossary anchor", () => {
    const guide = readFileSync(
      new URL("../../docs/guides/rank-measurements.mdx", import.meta.url),
      "utf8",
    );
    for (const { glossaryAnchor } of measurementHelpRegistry) {
      expect(guide, glossaryAnchor).toContain(`id="${glossaryAnchor.slice(1)}"`);
    }
  });

  it("keeps registry keys, glossary anchors, and allowed context distinct and immutable", () => {
    const keys = measurementHelpRegistry.map(
      (entry) => `${entry.metricId}/${entry.definitionVersion}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of measurementHelpRegistry) {
      expect(entry.glossaryAnchor).toMatch(/^#measurement-[a-z0-9-]+$/);
      expect(entry.titleKey).toBe(`entries.${entry.metricId}.title`);
      expect(entry.shortDefinitionKey).toBe(
        `entries.${entry.metricId}.versions.${entry.definitionVersion}.definition`,
      );
      expect(entry.interpretationKey).toBe(
        `entries.${entry.metricId}.versions.${entry.definitionVersion}.interpretation`,
      );
      expect(entry.limitationKey).toBe(
        `entries.${entry.metricId}.versions.${entry.definitionVersion}.limitation`,
      );
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.contextFields)).toBe(true);
    }
    expect(resolveMeasurementHelp("feature_presence", "help-v1", partialReport)).toMatchObject({
      status: "supported",
      context: {},
    });
  });

  it.each(["future-v2", "legacy-v0"])(
    "does not reuse a current definition or context for %s",
    (version) => {
      const resolved = resolveMeasurementHelp("organic_visibility_top20", version, partialReport);
      expect(resolved).toMatchObject({
        status: "unsupported_version",
        requestedVersion: version,
        context: {},
      });
      expect(JSON.stringify(resolved)).not.toContain("shortDefinitionKey");
      expect(JSON.stringify(resolved)).not.toContain("interpretationKey");
      expect(JSON.stringify(resolved)).not.toContain("limitationKey");
    },
  );

  it("distinguishes invalid IDs and malformed versions from a valid future version", () => {
    expect(resolveMeasurementHelp("translated-label", "v1")).toEqual({ status: "invalid_id" });
    expect(resolveMeasurementHelp("__proto__", "v1")).toEqual({ status: "invalid_id" });
    expect(resolveMeasurementHelp("organic_visibility_top20", null)).toEqual({
      status: "invalid_version",
    });
    expect(resolveMeasurementHelp("organic_visibility_top20", "<raw>")).toEqual({
      status: "invalid_version",
    });
  });

  it("retains independently reported observed/fresh/comparable counts without computing a score", () => {
    const help = resolveMeasurementHelp("organic_visibility_top20", "v1", partialReport);
    expect(help).toMatchObject({
      status: "supported",
      context: { expected: 2, measured: 1, unknown: 1, comparable: 1, freshDeterminate: null },
    });
    const serialized = JSON.stringify(help);
    expect(serialized).not.toContain("synthetic-private-target");
    expect(serialized).not.toContain("private-provider-payload");
    expect(serialized).not.toContain("recordedAt");
    expect(serialized).not.toContain("observedAt");
    expect(serialized).not.toContain('"value"');
    expect(serialized).not.toContain('"ranked"'); // Not an allowed context for this index.
  });

  it("preserves zero, leaves missing counters missing, and makes malformed counters unknown", () => {
    const counts = Object.assign(Object.create({ stale: 5 }), {
      expected: 0,
      measured: "1",
      unknown: Number.MAX_SAFE_INTEGER + 1,
      failed: -1,
      freshDeterminate: Number.NaN,
      comparable: 1.2,
    });
    expect(resolveMeasurementHelp("data_quality", "help-v1", { counts })).toMatchObject({
      context: {
        expected: 0,
        measured: null,
        unknown: null,
        failed: null,
        freshDeterminate: null,
        comparable: null,
      },
    });
    const help = resolveMeasurementHelp("data_quality", "help-v1", { counts });
    if (help.status === "supported") {
      expect(Object.hasOwn(help.context, "stale")).toBe(false);
      expect(Object.hasOwn(help.context, "neverChecked")).toBe(false);
    }
  });

  it.each([null, [], { counts: [] }, { counts: null }])(
    "does not invent context for %j",
    (report) => {
      expect(resolveMeasurementHelp("data_quality", "help-v1", report)).toMatchObject({
        context: {},
      });
    },
  );
});
