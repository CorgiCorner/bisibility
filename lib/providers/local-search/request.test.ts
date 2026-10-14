import { describe, expect, it } from "vitest";
import { disabledLocalCapability } from "./contracts";
import { buildLocalTaskRequest, localTaskGetUrl } from "./request";
import { localBindingFixture, nativeIds } from "./test-fixtures";

describe("documented local request shapes", () => {
  it.each(["maps", "local_finder"] as const)(
    "builds exact credential-free %s POST and preserves literal keyword symbols",
    (surface) => {
      const request = buildLocalTaskRequest(localBindingFixture(surface));
      expect(request.url).toBe(`https://api.dataforseo.com/v3/serp/google/${surface}/task_post`);
      expect(JSON.parse(request.body as string)).toEqual([
        {
          keyword: "synthetic cafe %2B 50%25",
          location_coordinate: "52.2297000,21.0122000,14z",
          language_code: "en",
          device: "desktop",
          os: "windows",
          depth: 20,
          priority: 1,
        },
      ]);
      expect(request.headers).toEqual({ "Content-Type": "application/json" });
      expect(JSON.stringify(request)).not.toContain("Authorization");
    },
  );

  it("rejects unsafe/unsupported request dimensions before any pricing or transport", () => {
    const binding = localBindingFixture();
    for (const target of [
      { ...binding.target, cutoff: 21 },
      { ...binding.target, zoom: null },
      { ...binding.target, zoom: 2 },
      { ...binding.target, operatingSystem: null },
      { ...binding.target, device: "mobile" as const, operatingSystem: "windows" },
      { ...binding.target, rankScale: "pack_slot" as const },
      { ...binding.target, language: "English" },
    ])
      expect(() => buildLocalTaskRequest({ ...binding, target })).toThrow();
    expect(() =>
      buildLocalTaskRequest({ ...binding, keyword: { ...binding.keyword, revision: "changed" } }),
    ).toThrow("binding mismatch");
    expect(() =>
      buildLocalTaskRequest({
        ...binding,
        point: { ...binding.point, coordinate: { latitude: "900", longitude: "21" } },
      }),
    ).toThrow();
    const finder = localBindingFixture("local_finder");
    expect(() =>
      buildLocalTaskRequest({ ...finder, target: { ...finder.target, zoom: 19 } }),
    ).toThrow();
    const mobile = {
      ...binding,
      target: { ...binding.target, device: "mobile" as const, operatingSystem: "android" },
    };
    expect(JSON.parse(buildLocalTaskRequest(mobile).body as string)[0].depth).toBe(20);
  });

  it("permits only exact provider GET origin/path plus native UUIDs, not returned URLs", () => {
    expect(localTaskGetUrl("maps", nativeIds[0])).toBe(
      `https://api.dataforseo.com/v3/serp/google/maps/task_get/advanced/${nativeIds[0]}`,
    );
    for (const id of [
      "../private",
      "https://untrusted.invalid",
      `${nativeIds[0]}?key=secret`,
      "credential:user",
    ]) {
      expect(() => localTaskGetUrl("maps", id)).toThrow("Invalid local retrieval reference");
    }
    expect(disabledLocalCapability.implementations).toEqual([]);
    expect(disabledLocalCapability.expiresAt).toBe("1970-01-01T00:00:00.000Z");
  });
});
