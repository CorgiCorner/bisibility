import { describe, expect, it } from "vitest";
import { cacheSettingsSchema, ttlOptions } from "./schema";

describe("project data cache settings", () => {
  it("accepts 2 weeks and 30 days and rejects values outside the option list", () => {
    expect(ttlOptions).toContain(1_209_600);
    expect(ttlOptions).toContain(2_592_000);
    const base = { projectId: "prj_public", expectedTtlSeconds: null };
    expect(cacheSettingsSchema.safeParse({ ...base, ttlSeconds: 1_209_600 }).success).toBe(true);
    expect(cacheSettingsSchema.safeParse({ ...base, ttlSeconds: 2_592_000 }).success).toBe(true);
    expect(cacheSettingsSchema.safeParse({ ...base, ttlSeconds: null }).success).toBe(true);
    expect(cacheSettingsSchema.safeParse({ ...base, ttlSeconds: 2_592_001 }).success).toBe(false);
    expect(cacheSettingsSchema.safeParse({ ...base, ttlSeconds: 604_801 }).success).toBe(false);
    expect(cacheSettingsSchema.safeParse({ ...base, ttlSeconds: 1000 }).success).toBe(false);
  });
});
