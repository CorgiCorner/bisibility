import { expect, it, vi } from "vitest";
import { loadRepairSource, writeRepairSource } from "./source";

const target = { kind: "check" as const, checkId: "check_abcdefgh" };
it("constrains retained checks and comparison sides to the authorized project", async () => {
  const query = vi.fn(async () => []);
  const tx = { $queryRaw: query } as unknown as Parameters<typeof loadRepairSource>[0];
  await expect(loadRepairSource(tx, "authorized", target)).rejects.toThrow("unavailable");
  expect(query.mock.calls[0].slice(1)).toEqual(["check_abcdefgh", "authorized"]);
  await expect(
    loadRepairSource(tx, "authorized", { kind: "comparison", runId: "run", provider: "serpapi" }),
  ).rejects.toThrow("unavailable");
  expect(query.mock.calls[1].slice(1)).toEqual(["authorized", "run", "serpapi"]);
});
it("hashes original evidence independently of a repair overlay and preserves source bytes on write", async () => {
  const raw = {
    organic_results: [{ rank: 2, url: "https://google.com/goto?url=one" }],
    provider_response: { original: "untouched" },
  };
  const query = vi.fn().mockResolvedValue([{ id: "internal", raw }]);
  const update = vi.fn();
  const tx = {
    $queryRaw: query,
    rankCheck: { update },
    observationRun: { findFirst: vi.fn().mockResolvedValue(null) },
  } as unknown as Parameters<typeof loadRepairSource>[0];
  const source = await loadRepairSource(tx, "authorized", target);
  const state = { status: "running" };
  query.mockResolvedValue([{ id: "internal", raw: { ...raw, _urlRepair: state } }]);
  expect((await loadRepairSource(tx, "authorized", target)).hash).toBe(source.hash);
  await writeRepairSource(tx, target, source, state);
  expect(update).toHaveBeenCalledExactlyOnceWith({
    where: { id: "internal" },
    data: { raw: { ...raw, _urlRepair: state } },
  });
  expect(raw).not.toHaveProperty("_urlRepair");
});

it("includes project-scoped retained Local Pack links in repair candidates", async () => {
  const mapsUrl = "https://google.com/goto?url=local";
  const findFirst = vi.fn().mockResolvedValue({
    items: [{ resultKind: "local_pack", businessName: "A shop", mapsUrl, positionInBlock: 1 }],
  });
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: "internal", raw: { organic_results: [] } }]),
    observationRun: { findFirst },
  } as unknown as Parameters<typeof loadRepairSource>[0];
  expect((await loadRepairSource(tx, "authorized", target)).rows).toEqual([
    { url: mapsUrl, rank: 1, type: "organic" },
  ]);
  expect(findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: { projectId: "authorized", rankCheckId: "internal" } }),
  );
});
