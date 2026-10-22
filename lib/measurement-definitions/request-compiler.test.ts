import { describe, expect, it } from "vitest";
import { frozenRequest, retainedRequestMatchesSource } from "./canonical";
import { requestSchema } from "./schema";
import { nativeBindingFixture } from "./worker-native.fixtures";

describe("frozen request compiler protocol", () => {
  it.each(["dataforseo", "serpapi"] as const)(
    "keeps exact historical %s request bytes and the current v2 policy distinct",
    (provider) => {
      const source = nativeBindingFixture(provider).source;
      const current = frozenRequest(source, provider, 20);
      expect(current).toMatchObject({
        compilerVersion: 2,
        stopOnMatch: false,
        findTargetsIn: null,
      });
      const { compilerVersion: _version, ...fields } = current as typeof current & {
        compilerVersion?: 2;
      };
      const legacy = {
        ...fields,
        stopOnMatch: true,
        findTargetsIn: provider === "dataforseo" ? "with_subdomains" : null,
      };
      expect(requestSchema.parse(legacy)).toEqual(legacy);
      expect(requestSchema.parse(legacy)).not.toHaveProperty("compilerVersion");
      expect(retainedRequestMatchesSource(source, legacy, provider, 20)).toBe(true);
      expect(retainedRequestMatchesSource(source, current, provider, 20)).toBe(true);
      expect(
        retainedRequestMatchesSource(
          source,
          { ...current, stopOnMatch: true, findTargetsIn: legacy.findTargetsIn },
          provider,
          20,
        ),
      ).toBe(false);
      expect(
        retainedRequestMatchesSource(
          source,
          { ...legacy, stopOnMatch: false, findTargetsIn: null },
          provider,
          20,
        ),
      ).toBe(false);
    },
  );
  it.each([1, 3, null, "2"])(
    "rejects explicit unsupported compiler version %s",
    (compilerVersion) => {
      expect(
        requestSchema.safeParse({ ...nativeBindingFixture("dataforseo").request, compilerVersion })
          .success,
      ).toBe(false);
    },
  );
  it("rejects unknown extra fields for both protocol shapes", () => {
    const current = nativeBindingFixture("dataforseo").request;
    const { compilerVersion: _version, ...legacy } = current as typeof current & {
      compilerVersion?: 2;
    };
    for (const request of [current, legacy])
      expect(requestSchema.safeParse({ ...request, bypass: true }).success).toBe(false);
  });
});
