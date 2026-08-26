import { parseProviderInstanceSlug } from "@/lib/instance-setting-definitions";
import { describe, expect, it } from "vitest";
import {
  buildProviderTag,
  type ProviderRequestContext,
  providerStage,
  resolveProviderInstanceSlug,
} from "./tag";

const context: ProviderRequestContext = {
  correlationId: "check:123",
  feature: "rank_check",
  projectId: "project:456",
  source: "app",
  trigger: "manual",
};

describe("buildProviderTag", () => {
  it("creates a deterministic, delimiter-safe provider tag", () => {
    const input = { context, instanceSlug: "white-label", stage: "production" };
    expect(buildProviderTag(input)).toBe(
      "app=white-label;stage=prod;src=app;trg=manual;f=rank_check;p=project-456;c=check:123",
    );
    expect(buildProviderTag(input)).toBe(buildProviderTag(input));
  });

  it("accepts exactly 255 bytes and rejects the adjacent 256-byte boundary", () => {
    const shortestPrefix = "app=b;stage=dev;src=app;trg=manual;f=rank_check;p=p;c=";
    const acceptedCorrelationId = "c".repeat(255 - Buffer.byteLength(shortestPrefix, "utf8"));
    const acceptedTag = buildProviderTag({
      context: { ...context, correlationId: acceptedCorrelationId },
      instanceSlug: "bisibility",
      stage: "dev",
    });
    expect(Buffer.byteLength(acceptedTag, "utf8")).toBe(255);
    expect(acceptedTag.slice(acceptedTag.lastIndexOf("c=") + 2)).toBe(acceptedCorrelationId);

    const rejectedCorrelationId = `${acceptedCorrelationId}c`;
    expect(Buffer.byteLength(`${shortestPrefix}${rejectedCorrelationId}`, "utf8")).toBe(256);
    expect(() =>
      buildProviderTag({
        context: { ...context, correlationId: rejectedCorrelationId },
        instanceSlug: "bisibility",
        stage: "dev",
      }),
    ).toThrow("correlationId is too long");
  });

  it("keeps normal queued correlation ids byte-for-byte", () => {
    const correlationId = "qtask_0123456789abcdef0123456789abcdef";
    const tag = buildProviderTag({
      context: { ...context, correlationId, source: "worker", trigger: "scheduled" },
      instanceSlug: "bisibility",
      stage: "dev",
    });
    expect(tag.endsWith(`c=${correlationId}`)).toBe(true);
  });

  it("resolves canonical and legacy instance slug settings safely", () => {
    expect(resolveProviderInstanceSlug([{ key: "provider_instance_slug", value: "legacy" }])).toBe(
      "legacy",
    );
    expect(
      resolveProviderInstanceSlug([
        { key: "provider_instance_slug", value: "legacy" },
        { key: "instance_slug", value: "canonical" },
      ]),
    ).toBe("canonical");
    expect(
      resolveProviderInstanceSlug([
        { key: "instance_slug", value: "INVALID value" },
        { key: "provider_instance_slug", value: "legacy" },
      ]),
    ).toBe("legacy");
    expect(resolveProviderInstanceSlug([])).toBe("bisibility");
  });

  it.each([
    [{ ...context, source: "browser" }, "source"],
    [{ ...context, trigger: "retry" }, "trigger"],
    [{ ...context, feature: "other" }, "feature"],
    [{ ...context, projectId: " ; " }, "projectId"],
    [{ ...context, correlationId: "" }, "correlationId"],
  ])("rejects invalid %s context", (invalid, field) => {
    expect(() =>
      buildProviderTag({
        context: invalid as ProviderRequestContext,
        instanceSlug: "bisibility",
      }),
    ).toThrow(field as string);
  });

  it("rejects missing, extra, and absent context", () => {
    const missing = { ...context } as Record<string, unknown>;
    delete missing.projectId;
    expect(() =>
      buildProviderTag({ context: missing as ProviderRequestContext, instanceSlug: "bisibility" }),
    ).toThrow("unknown or missing");
    expect(() =>
      buildProviderTag({
        context: { ...context, extra: "value" } as ProviderRequestContext,
        instanceSlug: "bisibility",
      }),
    ).toThrow("unknown or missing");
    expect(() => buildProviderTag({ context: null as never, instanceSlug: "bisibility" })).toThrow(
      "required",
    );
  });

  it("normalizes deployment stages and validates stable instance slugs", () => {
    expect(providerStage("staging")).toBe("stage");
    expect(providerStage("preview")).toBe("dev");
    expect(parseProviderInstanceSlug("white-label-1")).toBe("white-label-1");
    expect(parseProviderInstanceSlug("white_label")).toBe("white-label");
    expect(parseProviderInstanceSlug("White-label")).toBe("white-label");
    expect(parseProviderInstanceSlug("white--label")).toBe("white--label");
    expect(parseProviderInstanceSlug("white label")).toBeNull();
  });
});
