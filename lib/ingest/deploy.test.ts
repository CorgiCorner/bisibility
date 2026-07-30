import { describe, expect, it } from "vitest";
import {
  deploySignalPayload,
  httpSignalUrl,
  parseDeployEvent,
  shouldIgnoreDeployEvent,
} from "./deploy";
import amplifyFailed from "./fixtures/deploy/amplify-failed.json";
import amplifySucceeded from "./fixtures/deploy/amplify-succeeded.json";
import genericInvalid from "./fixtures/deploy/generic-invalid.json";
import genericSucceeded from "./fixtures/deploy/generic-succeeded.json";
import netlifyBuilding from "./fixtures/deploy/netlify-building.json";
import netlifyReady from "./fixtures/deploy/netlify-ready.json";
import vercelFailed from "./fixtures/deploy/vercel-failed.json";
import vercelSucceeded from "./fixtures/deploy/vercel-succeeded.json";

describe("parseDeployEvent", () => {
  it("maps completed Vercel deployment payloads", () => {
    const event = parseDeployEvent(vercelSucceeded, "vercel");

    expect(event).toEqual({
      deploymentId: "dpl_123",
      environment: "production",
      paths: ["/", "/pricing"],
      provider: "vercel",
      url: "https://app-example.vercel.app",
    });
  });

  it("ignores non-success Vercel deployment payloads", () => {
    expect(parseDeployEvent(vercelFailed, "vercel")).toBeNull();
    expect(shouldIgnoreDeployEvent(vercelFailed, "vercel")).toBe(true);
  });

  it("maps ready Netlify deployment payloads", () => {
    const event = parseDeployEvent(netlifyReady, "netlify");

    expect(event).toEqual({
      deploymentId: "deploy_1",
      environment: "main",
      provider: "netlify",
      url: "https://app.example.netlify.app",
    });
  });

  it("ignores non-ready Netlify deployment payloads", () => {
    expect(parseDeployEvent(netlifyBuilding, "netlify")).toBeNull();
    expect(shouldIgnoreDeployEvent(netlifyBuilding, "netlify")).toBe(true);
  });

  it("maps completed Amplify EventBridge deployment envelopes", () => {
    const event = parseDeployEvent(amplifySucceeded, "amplify");

    expect(event).toEqual({
      deploymentId: "42",
      environment: "main",
      provider: "amplify",
      url: "https://main.d1a2b3c4d5e6f7.amplifyapp.com",
    });
  });

  it("maps completed bare Amplify deployment details", () => {
    expect(
      parseDeployEvent(
        {
          appId: "d1a2b3c4d5e6f7",
          branchName: "main",
          jobId: "43",
          jobStatus: "SUCCEED",
        },
        "amplify",
      ),
    ).toEqual({
      deploymentId: "43",
      environment: "main",
      provider: "amplify",
      url: "https://main.d1a2b3c4d5e6f7.amplifyapp.com",
    });
  });

  it("normalizes padded Amplify job statuses before matching", () => {
    expect(
      parseDeployEvent(
        {
          appId: "d1a2b3c4d5e6f7",
          branchName: "main",
          jobId: "44",
          jobStatus: " SUCCEED ",
        },
        "amplify",
      ),
    ).toMatchObject({ deploymentId: "44", provider: "amplify" });
  });

  it("omits Amplify URLs for slashed branch names", () => {
    expect(
      parseDeployEvent(
        {
          appId: "d1a2b3c4d5e6f7",
          branchName: "feature/search",
          jobId: "44",
          jobStatus: "SUCCEED",
        },
        "amplify",
      ),
    ).toEqual({
      deploymentId: "44",
      environment: "feature/search",
      provider: "amplify",
    });
  });

  it("falls back to the Amplify EventBridge envelope id", () => {
    expect(
      parseDeployEvent(
        {
          detail: {
            appId: "d1a2b3c4d5e6f7",
            branchName: "main",
            jobStatus: "SUCCEED",
          },
          id: "event_2",
          source: "aws.amplify",
        },
        "amplify",
      ),
    ).toEqual({
      deploymentId: "event_2",
      environment: "main",
      provider: "amplify",
      url: "https://main.d1a2b3c4d5e6f7.amplifyapp.com",
    });
  });

  it("ignores non-success Amplify deployment statuses", () => {
    expect(parseDeployEvent(amplifyFailed, "amplify")).toBeNull();
    expect(shouldIgnoreDeployEvent(amplifyFailed, "amplify")).toBe(true);
  });

  it("does not ignore unrecognized Amplify payloads", () => {
    expect(parseDeployEvent({ hello: "world" }, "amplify")).toBeNull();
    expect(shouldIgnoreDeployEvent({ hello: "world" }, "amplify")).toBe(false);
  });

  it("maps generic deploy payloads", () => {
    expect(parseDeployEvent(genericSucceeded, null)).toEqual({
      deploymentId: "deploy_generic",
      environment: "preview",
      paths: ["/docs"],
      provider: "generic",
      url: "https://example.com/docs",
    });
  });

  it("returns null for garbage payloads", () => {
    expect(parseDeployEvent("not an object", null)).toBeNull();
    expect(parseDeployEvent(genericInvalid, null)).toBeNull();
  });

  it("caps paths at 50 entries and keeps signal payloads under 8KB", () => {
    const paths = Array.from({ length: 80 }, (_, index) => `/path-${index}`);
    const event = parseDeployEvent({ paths, url: "https://example.com" }, null);

    expect(event?.paths).toHaveLength(50);
    if (!event) throw new Error("Expected generic deploy event.");
    const payload = deploySignalPayload({
      ...event,
      paths: Array.from({ length: 50 }, (_, index) => `/${"x".repeat(400)}-${index}`),
    });

    expect(payload.paths?.length).toBeLessThanOrEqual(50);
    expect(Buffer.byteLength(JSON.stringify(payload), "utf8")).toBeLessThanOrEqual(8 * 1024);
  });

  it("emits only http and https signal URLs", () => {
    expect(httpSignalUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(httpSignalUrl("ftp://example.com/a")).toBeUndefined();
    expect(httpSignalUrl("not a url")).toBeUndefined();
  });
});
