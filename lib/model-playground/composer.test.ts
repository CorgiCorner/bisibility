import { describe, expect, it } from "vitest";
import { composerFixture } from "./composer-fixtures.test-support";
import { connectionReadiness, newColumn, validateComposer } from "./composer-state";
import { modelPlaygroundDraftSchema } from "./schema";

describe("native composer guards", () => {
  it.each([
    ["a".repeat(500), true],
    ["a".repeat(501), false],
    ["😀".repeat(500), true],
    [`${"😀".repeat(500)}a`, false],
  ])("bounds the prompt by Unicode characters and bytes", (prompt, valid) => {
    expect(
      modelPlaygroundDraftSchema.safeParse({ ...composerFixture().input, prompt }).success,
    ).toBe(valid);
  });
  it.each([
    { providerId: "dataforseo" },
    { sourceKind: "consumer_capture" },
    { payment: { optionId: "own", fundingSource: "platform" } },
  ])("rejects excluded choices %j", (change) => {
    const { input } = composerFixture();
    expect(
      modelPlaygroundDraftSchema.safeParse({
        ...input,
        columns: [{ ...input.columns[0], ...change }],
      }).success,
    ).toBe(false);
  });
  it("does not collapse identical models on different providers and refuses a seventh column", () => {
    const { input, connections, catalogs } = composerFixture();
    const other = newColumn(catalogs[1].models[0], connections[1]);
    expect(other.modelId).toBe(input.columns[0].modelId);
    expect(other.columnId).not.toBe(input.columns[0].columnId);
    expect(
      validateComposer({ ...input, columns: [input.columns[0], other] }, catalogs, connections),
    ).toEqual([]);
    expect(
      modelPlaygroundDraftSchema.safeParse({
        ...input,
        columns: Array.from({ length: 7 }, () => newColumn(catalogs[0].models[0], connections[0])),
      }).success,
    ).toBe(false);
  });
  it.each(["planned", "needs_reauth", "disabled", "missing"])("blocks %s connections", (state) => {
    const { input, catalogs, connections } = composerFixture();
    connections[0] = {
      ...connections[0],
      ...(state === "disabled"
        ? { enabled: false }
        : state === "missing"
          ? { hasStoredCredentials: false }
          : { status: state as "planned" | "needs_reauth" }),
    };
    expect(connectionReadiness(connections[0])).not.toBe("connected");
    expect(validateComposer(input, catalogs, connections).length).toBeGreaterThan(0);
  });
  it("blocks a stale catalog or removed selected model instead of skipping it", () => {
    const { input, catalogs, connections } = composerFixture();
    catalogs[0].models = [];
    expect(validateComposer(input, catalogs, connections).length).toBeGreaterThan(0);
    catalogs[0].expiresAt = "2000-01-01T00:00:00Z";
    expect(validateComposer(input, catalogs, connections).length).toBeGreaterThan(0);
  });
  it("rejects temperature, search hints and token counts unsupported by the selected route", () => {
    const { input, catalogs, connections } = composerFixture();
    for (const settings of [
      { ...input.columns[0].settings, maxOutputTokens: 4096 },
      { ...input.columns[0].settings, temperature: 1 },
      { ...input.columns[0].settings, search: { mode: "openrouter_web_exa" } },
    ])
      expect(
        validateComposer(
          { ...input, columns: [{ ...input.columns[0], settings }] },
          catalogs,
          connections,
        ).length,
      ).toBeGreaterThan(0);
  });
});
