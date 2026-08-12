import { getOpsConfig } from "@/lib/ops/config";
import { formatOpsSlackPayload, postOpsSlackWebhook, redactOpsText } from "@/lib/ops/slack";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("ops Slack payloads", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("redacts credentials, tokens, webhook paths, and URL query strings", () => {
    const input = [
      "token=plain-secret",
      "Bearer bearer-secret",
      "xoxb-123-secret",
      "https://example.com/path?access_token=query-secret",
      "https://hooks.slack.com/services/T/B/secret",
      "postgresql://user:password@db.example/database",
      `${["AWS", "SECRET", "ACCESS", "KEY"].join("_")}=aws-test-value`,
      `${["DATABASE", "PASSWORD"].join("_")}=db-test-value`,
      ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjMifQ", "jwt-signature"].join("."),
    ].join(" ");

    const redacted = redactOpsText(input, 2_000);
    expect(redacted).not.toMatch(
      /plain-secret|bearer-secret|xoxb|query-secret|\/T\/B\/secret|aws-test|db-test|jwt-signature/,
    );
    expect(redacted).not.toContain("user:password");
    expect(redactOpsText("https://example.com/path?access_token=query-secret", 2_000)).toBe(
      "https://example.com/path",
    );
  });

  it("formats capped Block Kit values as readable full-width sections", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_VERSION", "1.2.3");
    vi.stubEnv("SITE_URL", "https://bisibility.example/?token=secret");
    const fields = Object.fromEntries(
      Array.from({ length: 14 }, (_, index) => [`Field ${index}`, "x".repeat(700)]),
    );

    const payload = formatOpsSlackPayload({
      fields,
      kind: "traffic_sync",
      severity: "warning",
      title: "Traffic sync warning",
    });

    expect(payload.text).toContain("⚠️ Traffic sync warning");
    const fieldBlocks = payload.blocks.slice(1, -1) as Array<{
      fields?: unknown;
      text?: { text: string };
      type: string;
    }>;
    expect(fieldBlocks).toHaveLength(10);
    expect(fieldBlocks.every((block) => block.type === "section" && !block.fields)).toBe(true);
    expect(fieldBlocks[0]?.text?.text.length).toBeLessThan(650);
    expect(JSON.stringify(payload)).toContain("Release: 1.2.3");
    expect(JSON.stringify(payload)).not.toContain("token=secret");
  });

  it("uses one heartbeat footer with a short release and operator links", () => {
    vi.stubEnv("APP_VERSION", "0123456789abcdef0123456789abcdef01234567");
    vi.stubEnv("SITE_URL", "https://bisibility.example");
    vi.stubEnv("TEMPORAL_UI_URL", "https://temporal.example");

    const payload = formatOpsSlackPayload({
      fields: { Healthy: "worker up" },
      kind: "heartbeat",
      severity: "info",
      title: "bisibility daily digest - all healthy",
    });
    const rendered = JSON.stringify(payload);

    expect(payload.blocks.filter((block) => block.type === "context")).toHaveLength(1);
    expect(rendered).toContain("Release: 0123456789ab");
    expect(rendered).toContain("https://bisibility.example/app");
    expect(rendered).toContain("https://temporal.example");
    expect(rendered).not.toContain("0123456789abcdef0123456789abcdef01234567");
  });

  it("posts a webhook payload and reports only the HTTP status on failure", async () => {
    vi.stubEnv("OPS_SLACK_WEBHOOK_URL", "https://hooks.slack.com/services/T/B/secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret body", { status: 503 })));

    await expect(
      postOpsSlackWebhook(getOpsConfig(), {
        kind: "test",
        severity: "info",
        title: "Test",
      }),
    ).rejects.toThrow("status 503");
  });
});
