import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { type ApnsRequest, apnsConfig, createApnsSender, type PushMessage } from "./apns";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const config = {
  keyId: "APNSKEY123",
  privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  teamId: "TEAM123456",
  topic: "com.example.app",
};
const message: PushMessage = {
  body: '"seo tool" is now #12 (was #8).',
  collapseId: "alr_a:kw_b",
  data: { alert_id: "al_x", keyword_id: "kw_b" },
  threadId: "prj_c",
  title: "Keyword fell out of the top 10",
};

function sender(...statuses: Array<{ body?: string; status: number }>) {
  const requests: ApnsRequest[] = [];
  const responses = [...statuses];
  let clock = Date.parse("2026-10-17T12:00:00Z");
  const instance = createApnsSender(config, {
    now: () => new Date(clock),
    transport: async (request) => {
      requests.push(request);
      const next = responses.shift() ?? { status: 200 };
      return { body: next.body ?? "", status: next.status };
    },
  });
  return { advance: (ms: number) => (clock += ms), instance, requests };
}

describe("APNs sender", () => {
  it("sends an alert push with token auth, topic, collapse id and thread", async () => {
    const { instance, requests } = sender({ status: 200 });
    expect(await instance.send("ab".repeat(32), "sandbox", message)).toEqual({ kind: "sent" });
    const [request] = requests;
    expect(request).toMatchObject({ environment: "sandbox", path: `/3/device/${"ab".repeat(32)}` });
    expect(request?.headers).toMatchObject({
      "apns-collapse-id": "alr_a:kw_b",
      "apns-push-type": "alert",
      "apns-topic": "com.example.app",
    });
    expect(JSON.parse(request?.body ?? "")).toEqual({
      alert_id: "al_x",
      aps: {
        alert: { body: message.body, title: message.title },
        sound: "default",
        "thread-id": "prj_c",
      },
      keyword_id: "kw_b",
    });
    const [header, claims, signature] = String(request?.headers.authorization)
      .replace("bearer ", "")
      .split(".");
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({
      iat: 1792238400,
      iss: "TEAM123456",
    });
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${claims}`),
        {
          dsaEncoding: "ieee-p1363",
          format: "pem",
          key: publicKey.export({ format: "pem", type: "spki" }).toString(),
        },
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
  });

  it("reuses the provider token for 50 minutes, then refreshes it", async () => {
    const { advance, instance, requests } = sender();
    await instance.send("ab".repeat(32), "production", message);
    advance(10 * 60 * 1000);
    await instance.send("ab".repeat(32), "production", message);
    advance(45 * 60 * 1000);
    await instance.send("ab".repeat(32), "production", message);
    const auth = requests.map((request) => request.headers.authorization);
    expect(auth[0]).toBe(auth[1]);
    expect(auth[2]).not.toBe(auth[1]);
  });

  it("classifies invalid tokens, throttling and rejections", async () => {
    const { instance } = sender(
      { body: '{"reason":"Unregistered"}', status: 410 },
      { body: '{"reason":"BadDeviceToken"}', status: 400 },
      { body: '{"reason":"TooManyRequests"}', status: 429 },
      { body: '{"reason":"InvalidProviderToken"}', status: 403 },
    );
    const results = [];
    for (let index = 0; index < 4; index += 1) {
      results.push((await instance.send("ab".repeat(32), "production", message)).kind);
    }
    expect(results).toEqual(["invalid_token", "invalid_token", "retryable", "rejected"]);
  });

  it("is unconfigured without the key, and defaults the topic to the app bundle", () => {
    expect(apnsConfig({})).toBeNull();
    expect(
      apnsConfig({ APNS_KEY_ID: "k", APNS_PRIVATE_KEY: "pem", APNS_TEAM_ID: "t" })?.topic,
    ).toBe("com.bisibility.app");
  });
});
