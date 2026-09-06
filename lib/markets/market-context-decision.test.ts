import { ProjectMarketStatus } from "@/lib/generated/prisma/client";
import { describe, expect, it } from "vitest";
import { decideMarketContext, type MarketRegistryRow } from "./market-context-decision";

const PROJECT_ID = "project_internal_1";
const OTHER_PROJECT_ID = "project_internal_2";
const MARKET_REF = `pmkt_${"a".repeat(24)}`;

function row(overrides: Partial<MarketRegistryRow> = {}): MarketRegistryRow {
  return {
    projectId: PROJECT_ID,
    publicId: MARKET_REF,
    status: ProjectMarketStatus.active,
    ...overrides,
  };
}

describe("decideMarketContext", () => {
  it("resolves an active market of this project", () => {
    expect(decideMarketContext(PROJECT_ID, MARKET_REF, row())).toEqual({
      kind: "market",
      marketRef: MARKET_REF,
    });
  });

  it("resolves a paused market, which is navigable and simply not being checked", () => {
    expect(
      decideMarketContext(PROJECT_ID, MARKET_REF, row({ status: ProjectMarketStatus.paused })),
    ).toEqual({ kind: "market", marketRef: MARKET_REF });
  });

  it("sends an archived market to the note instead of a dead page", () => {
    expect(
      decideMarketContext(PROJECT_ID, MARKET_REF, row({ status: ProjectMarketStatus.removed })),
    ).toEqual({ kind: "archived", marketRef: MARKET_REF });
  });

  it("answers not-found for an unknown id", () => {
    expect(decideMarketContext(PROJECT_ID, MARKET_REF, null)).toEqual({ kind: "not-found" });
  });

  it("answers not-found for anything that is not a market publicId", () => {
    expect(decideMarketContext(PROJECT_ID, "loc_frankfurt", row())).toEqual({ kind: "not-found" });
    expect(decideMarketContext(PROJECT_ID, `prj_${"a".repeat(24)}`, row())).toEqual({
      kind: "not-found",
    });
  });

  it("answers not-found, never a redirect, for a market owned by another project", () => {
    // A redirect here would confirm the id exists. Archived status must not change that.
    expect(
      decideMarketContext(PROJECT_ID, MARKET_REF, row({ projectId: OTHER_PROJECT_ID })),
    ).toEqual({ kind: "not-found" });
    expect(
      decideMarketContext(
        PROJECT_ID,
        MARKET_REF,
        row({ projectId: OTHER_PROJECT_ID, status: ProjectMarketStatus.removed }),
      ),
    ).toEqual({ kind: "not-found" });
  });
});
