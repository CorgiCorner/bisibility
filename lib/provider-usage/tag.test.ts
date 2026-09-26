import { parseProviderInstanceSlug } from "@/lib/instance-setting-definitions";
import { describe, expect, it } from "vitest";
import {
  buildProviderTag,
  createProviderRequestAttribution,
  PROVIDER_REQUEST_SOURCES,
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
  it("accepts the api source and renders src=api in the tag", () => {
    const tag = buildProviderTag({
      context: { ...context, source: "api" },
      instanceSlug: "bisibility",
      stage: "dev",
    });
    expect(tag).toContain("src=api");
    expect(PROVIDER_REQUEST_SOURCES).toContain("api");
  });

  it("creates a deterministic, delimiter-safe provider tag", () => {
    const input = { context, instanceSlug: "white-label", stage: "production" };
    expect(buildProviderTag(input)).toBe(
      "app=white-label;stage=prod;src=app;trg=manual;f=rank_check;p=project-456;c=check:123",
    );
    expect(buildProviderTag(input)).toBe(buildProviderTag(input));
  });

  it.each(["own", "hosted"] as const)(
    "renders cs=%s in the tag when a credential source is supplied",
    (credentialSource) => {
      const tag = buildProviderTag({
        context,
        credentialSource,
        instanceSlug: "bisibility",
        stage: "dev",
      });
      expect(tag).toBe(
        `app=bisibility;stage=dev;src=app;cs=${credentialSource};trg=manual;f=rank_check;p=project-456;c=check:123`,
      );
    },
  );

  it("preserves the legacy tag byte-for-byte when no credential source is supplied", () => {
    const input = { context, instanceSlug: "white-label", stage: "production" };
    const legacyTag =
      "app=white-label;stage=prod;src=app;trg=manual;f=rank_check;p=project-456;c=check:123";
    expect(buildProviderTag(input)).toBe(legacyTag);
    expect(buildProviderTag({ ...input, credentialSource: undefined })).toBe(legacyTag);
    expect(buildProviderTag(input)).not.toContain("cs=");
  });

  it("preserves source, trigger, and correlation id alongside cs attribution", () => {
    const correlationId = "qtask_0123456789abcdef0123456789abcdef";
    const tag = buildProviderTag({
      context: { ...context, correlationId, source: "worker", trigger: "scheduled" },
      credentialSource: "own",
      instanceSlug: "bisibility",
      stage: "dev",
    });
    expect(tag).toBe(
      "app=bisibility;stage=dev;src=worker;cs=own;trg=scheduled;f=rank_check;p=project-456;c=qtask_0123456789abcdef0123456789abcdef",
    );
  });

  it.each(["shared", "", null, 0])("rejects invalid credentialSource %p", (invalid) => {
    expect(() =>
      buildProviderTag({ context, credentialSource: invalid as never, instanceSlug: "bisibility" }),
    ).toThrow("credentialSource is invalid");
  });

  it("counts cs bytes toward the 255-byte bound and truncates the project id first", () => {
    const projectId = "p".repeat(64);
    const correlationId = "c".repeat(138);
    const input = {
      context: { ...context, correlationId, projectId },
      instanceSlug: "b",
      stage: "dev",
    };
    expect(Buffer.byteLength(buildProviderTag(input), "utf8")).toBe(255);
    const withCs = buildProviderTag({ ...input, credentialSource: "hosted" });
    expect(Buffer.byteLength(withCs, "utf8")).toBe(255);
    expect(withCs).toContain("cs=hosted");
    expect(withCs.endsWith(`c=${correlationId}`)).toBe(true);
    expect(withCs.slice(withCs.lastIndexOf("p=") + 2, withCs.lastIndexOf(";c="))).toBe(
      "p".repeat(54),
    );
  });

  it("accepts a cs tag at exactly 255 bytes and never truncates the correlation id", () => {
    const shortestPrefix = "app=b;stage=dev;src=app;cs=own;trg=manual;f=rank_check;p=p;c=";
    const acceptedCorrelationId = "c".repeat(255 - Buffer.byteLength(shortestPrefix, "utf8"));
    const input = {
      context: { ...context, correlationId: acceptedCorrelationId, projectId: "p" },
      credentialSource: "own" as const,
      instanceSlug: "b",
      stage: "dev",
    };
    const acceptedTag = buildProviderTag(input);
    expect(Buffer.byteLength(acceptedTag, "utf8")).toBe(255);
    expect(acceptedTag.slice(acceptedTag.lastIndexOf("c=") + 2)).toBe(acceptedCorrelationId);
    expect(() =>
      buildProviderTag({
        ...input,
        context: { ...input.context, correlationId: `${acceptedCorrelationId}c` },
      }),
    ).toThrow("correlationId is too long");
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

describe("createProviderRequestAttribution", () => {
  it("carries the given credential without changing the tag", async () => {
    const credential = { id: "key_1", kind: "project_key" } as const;
    const [withCredential, withoutCredential] = await Promise.all([
      createProviderRequestAttribution(context, credential),
      createProviderRequestAttribution(context),
    ]);
    expect(withCredential.credential).toEqual({ id: "key_1", kind: "project_key" });
    expect(withCredential.tag).toBe(withoutCredential.tag);
  });

  it("omits the credential key when no credential is given", async () => {
    const attribution = await createProviderRequestAttribution(context);
    expect("credential" in attribution).toBe(false);
  });

  it("includes cs attribution alongside the credential without changing the context", async () => {
    const credential = { id: "key_1", kind: "project_key" } as const;
    const attribution = await createProviderRequestAttribution(context, credential, "hosted");
    expect(attribution.tag).toContain("cs=hosted");
    expect(attribution.context).toEqual(context);
    expect(attribution.credential).toEqual({ id: "key_1", kind: "project_key" });
  });

  it("keeps the legacy tag when the third argument is omitted", async () => {
    const [omitted, explicit] = await Promise.all([
      createProviderRequestAttribution(context),
      createProviderRequestAttribution(context, undefined, undefined),
    ]);
    expect(explicit.tag).toBe(omitted.tag);
    expect(explicit.tag).not.toContain("cs=");
  });

  it("rejects an invalid credential source supplied at runtime", async () => {
    await expect(
      createProviderRequestAttribution(context, undefined, "shared" as never),
    ).rejects.toThrow("credentialSource is invalid");
  });
});
