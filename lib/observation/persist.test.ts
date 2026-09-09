import { Prisma } from "@/lib/generated/prisma/client";
import { describe, expect, it, vi } from "vitest";
import { persistObservationRun } from "./persist";
import type { ObservationRunInput } from "./types";

const executedAt = new Date("2026-08-28T20:30:00.000Z");

function observationInput(): ObservationRunInput {
  return {
    provider: "example-provider",
    surface: "web_serp",
    engine: "google",
    requestPolicy: {
      depth: 20,
      stopOnMatch: true,
      findTargetsIn: "organic",
      forcedAiOverview: false,
    },
    completeness: "complete",
    configuredScope: { location: "US", language: "en", device: "desktop" },
    executedAt,
    items: [
      {
        resultKind: "organic_result",
        rankAbsolute: 1,
        domain: "example.com",
        url: "https://example.com/one",
        rawFragment: { item: "one" },
      },
      {
        resultKind: "local_pack",
        blockPosition: 2,
        domain: "example.org",
        rawFragment: { item: "two" },
      },
      {
        resultKind: "ai_overview",
        blockPosition: 3,
        rawFragment: { item: "three" },
      },
    ],
  };
}

function transaction() {
  return {
    observationRun: { create: vi.fn().mockResolvedValue({ id: "observation_run_1" }) },
    observationItem: { createMany: vi.fn().mockResolvedValue({ count: 3 }) },
  };
}

describe("persistObservationRun", () => {
  it("writes one run and every item with the created run id", async () => {
    const tx = transaction();

    await persistObservationRun(tx as never, {
      rankCheckId: "rank_check_1",
      projectId: "project_1",
      input: observationInput(),
    });

    expect(tx.observationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        effectiveScope: Prisma.DbNull,
        projectId: "project_1",
        rankCheckId: "rank_check_1",
      }),
    });
    const items = tx.observationItem.createMany.mock.calls[0]?.[0].data;
    expect(items).toHaveLength(3);
    expect(items.map((item: { observationRunId: string }) => item.observationRunId)).toEqual([
      "observation_run_1",
      "observation_run_1",
      "observation_run_1",
    ]);
    expect(items.map((item: { resultKind: string }) => item.resultKind)).toEqual([
      "organic_result",
      "local_pack",
      "ai_overview",
    ]);
    expect(items.map((item: { ordinal: number }) => item.ordinal)).toEqual([0, 1, 2]);
  });

  it("stores each item's own raw fragment", async () => {
    const tx = transaction();

    await persistObservationRun(tx as never, {
      rankCheckId: "rank_check_1",
      projectId: "project_1",
      input: observationInput(),
    });

    const items = tx.observationItem.createMany.mock.calls[0]?.[0].data;
    expect(items.map((item: { rawFragment: unknown }) => item.rawFragment)).toEqual([
      { item: "one" },
      { item: "two" },
      { item: "three" },
    ]);
  });

  it("persists completeness verbatim", async () => {
    const tx = transaction();
    const input = observationInput();
    input.completeness = "truncated_by_stop_on_match";

    await persistObservationRun(tx as never, {
      rankCheckId: "rank_check_1",
      projectId: "project_1",
      input,
    });

    expect(tx.observationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ completeness: "truncated_by_stop_on_match" }),
    });
  });

  it("maps every provider field onto the item row", async () => {
    const tx = transaction();
    const input = observationInput();
    input.items = [
      {
        resultKind: "local_pack",
        rankGroup: 1,
        rankAbsolute: 4,
        blockPosition: 2,
        positionInBlock: 3,
        title: "Example Bakery",
        url: "https://example.com/bakery",
        domain: "example.com",
        businessName: "Example Bakery",
        placeId: "place_example_1",
        cid: "12345678901234567890",
        mapsUrl: "https://example.org/maps/example-bakery",
        rating: { value: 4.5, count: 128 },
        rawFragment: { title: "Example Bakery", type: "local_pack" },
      },
    ];

    await persistObservationRun(tx as never, {
      rankCheckId: "rank_check_1",
      projectId: "project_1",
      input,
    });

    expect(tx.observationRun.create).toHaveBeenCalledWith({
      data: {
        rankCheckId: "rank_check_1",
        projectId: "project_1",
        provider: "example-provider",
        surface: "web_serp",
        engine: "google",
        requestPolicy: {
          depth: 20,
          stopOnMatch: true,
          findTargetsIn: "organic",
          forcedAiOverview: false,
        },
        completeness: "complete",
        configuredScope: { location: "US", language: "en", device: "desktop" },
        effectiveScope: Prisma.DbNull,
        executedAt,
      },
    });
    expect(tx.observationItem.createMany).toHaveBeenCalledWith({
      data: [
        {
          observationRunId: "observation_run_1",
          resultKind: "local_pack",
          ordinal: 0,
          rankGroup: 1,
          rankAbsolute: 4,
          blockPosition: 2,
          positionInBlock: 3,
          title: "Example Bakery",
          url: "https://example.com/bakery",
          domain: "example.com",
          businessName: "Example Bakery",
          placeId: "place_example_1",
          cid: "12345678901234567890",
          mapsUrl: "https://example.org/maps/example-bakery",
          rating: { value: 4.5, count: 128 },
          rawFragment: { title: "Example Bakery", type: "local_pack" },
        },
      ],
    });
    const item = tx.observationItem.createMany.mock.calls[0]?.[0].data[0];
    // CID is opaque (ADR-015): it must never be parsed into a number.
    expect(typeof item.cid).toBe("string");
    expect(item.cid).toBe("12345678901234567890");
  });

  it("maps absent rating and raw fragment onto the right JSON nulls", async () => {
    const tx = transaction();
    const input = observationInput();
    input.items = [{ resultKind: "ai_overview", rating: null, rawFragment: null }];

    await persistObservationRun(tx as never, {
      rankCheckId: "rank_check_1",
      projectId: "project_1",
      input,
    });

    const item = tx.observationItem.createMany.mock.calls[0]?.[0].data[0];
    expect(item.rating).toBe(Prisma.DbNull);
    expect(item.rawFragment).toBe(Prisma.JsonNull);
    expect(item.ordinal).toBe(0);
  });

  it("creates the run without calling createMany when there are no items", async () => {
    const tx = transaction();
    const input = observationInput();
    input.items = [];

    await persistObservationRun(tx as never, {
      rankCheckId: "rank_check_1",
      projectId: "project_1",
      input,
    });

    expect(tx.observationRun.create).toHaveBeenCalledOnce();
    expect(tx.observationItem.createMany).not.toHaveBeenCalled();
  });
});
