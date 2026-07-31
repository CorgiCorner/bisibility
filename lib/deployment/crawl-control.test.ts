import {
  createSelfHostedRobotsResponse,
  createSelfHostedRobotsTxt,
  SELF_HOSTED_ALLOW_INDEXING_ENV,
  selfHostedRobotsTag,
} from "@/lib/deployment/crawl-control";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("self-hosted crawl control", () => {
  beforeEach(() => {
    delete process.env[SELF_HOSTED_ALLOW_INDEXING_ENV];
  });

  afterEach(() => {
    delete process.env[SELF_HOSTED_ALLOW_INDEXING_ENV];
  });

  it("fails closed to Disallow: / when the environment variable is missing", async () => {
    const response = createSelfHostedRobotsResponse();

    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    await expect(response.text()).resolves.toBe("User-agent: *\nDisallow: /\n");
    expect(selfHostedRobotsTag()).toBe("noindex");
  });

  it.each(["1", "yes", "on", "unexpected"])(
    "fails closed to Disallow: / for malformed value %s",
    (value) => {
      expect(createSelfHostedRobotsTxt(value)).toBe("User-agent: *\nDisallow: /\n");
      expect(selfHostedRobotsTag(value)).toBe("noindex");
    },
  );

  it.each([undefined, "false", "true", "unexpected"])(
    "never publishes a Sitemap line for value %s",
    (value) => {
      expect(createSelfHostedRobotsTxt(value)).not.toMatch(/^Sitemap:/m);
    },
  );

  it("allows indexing only with an explicit true value", () => {
    expect(createSelfHostedRobotsTxt(" TRUE ")).toBe("User-agent: *\nAllow: /\n");
    expect(selfHostedRobotsTag(" TRUE ")).toBeNull();
  });
});
