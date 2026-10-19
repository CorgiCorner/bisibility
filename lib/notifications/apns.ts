import "server-only";

import { createPrivateKey, sign } from "node:crypto";
import { connect } from "node:http2";

export type PushEnvironment = "production" | "sandbox";

export type ApnsConfig = {
  keyId: string;
  privateKey: string;
  teamId: string;
  /** App bundle id; tokens registered for another bundle are never sent to. */
  topic: string;
};

type Env = Record<string, string | undefined>;

export const DEFAULT_APNS_TOPIC = "com.bisibility.app";

/** Token-based APNs auth from the deployment secret store; null when unconfigured. */
export function apnsConfig(env: Env = process.env): ApnsConfig | null {
  const keyId = env.APNS_KEY_ID?.trim();
  const teamId = env.APNS_TEAM_ID?.trim();
  const privateKey = env.APNS_PRIVATE_KEY?.trim().replaceAll("\\n", "\n");
  if (!keyId || !teamId || !privateKey) return null;
  return { keyId, privateKey, teamId, topic: env.APNS_TOPIC?.trim() || DEFAULT_APNS_TOPIC };
}

export type ApnsRequest = {
  body: string;
  environment: PushEnvironment;
  headers: Record<string, string>;
  path: string;
};

export type ApnsResponse = { body: string; status: number };

export type ApnsTransport = (request: ApnsRequest) => Promise<ApnsResponse>;

const HOSTS: Record<PushEnvironment, string> = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
};

/** One HTTP/2 request per call; APNs requires HTTP/2. */
export const http2Transport: ApnsTransport = (request) =>
  new Promise((resolve, reject) => {
    const session = connect(HOSTS[request.environment]);
    session.on("error", reject);
    const stream = session.request({
      ":method": "POST",
      ":path": request.path,
      ...request.headers,
    });
    stream.setTimeout(10_000, () => stream.close());
    let status = 0;
    let body = "";
    stream.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => {
      body += chunk;
    });
    stream.on("end", () => {
      session.close();
      resolve({ body, status });
    });
    stream.on("error", (error) => {
      session.close();
      reject(error);
    });
    stream.end(request.body);
  });

export type PushMessage = {
  body: string;
  collapseId: string;
  data: Record<string, string>;
  threadId: string;
  title: string;
};

export type PushResult =
  | { kind: "sent" }
  | { kind: "invalid_token"; reason: string }
  | { kind: "retryable"; reason: string }
  | { kind: "rejected"; reason: string };

export interface PushSender {
  readonly topic: string;
  send(token: string, environment: PushEnvironment, message: PushMessage): Promise<PushResult>;
}

const TOKEN_REFRESH_MS = 50 * 60 * 1000;
const INVALID_TOKEN_REASONS = new Set(["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"]);

function reasonOf(body: string): string {
  try {
    const parsed = JSON.parse(body) as { reason?: unknown };
    return typeof parsed.reason === "string" ? parsed.reason : "Unknown";
  } catch {
    return "Unknown";
  }
}

/** APNs alert payload: no secrets and no SERP data, only ids for deep linking. */
export function apnsPayload(message: PushMessage): string {
  return JSON.stringify({
    ...message.data,
    aps: {
      alert: { body: message.body, title: message.title },
      sound: "default",
      "thread-id": message.threadId,
    },
  });
}

export function createApnsSender(
  config: ApnsConfig,
  options: { now?: () => Date; transport?: ApnsTransport } = {},
): PushSender {
  const transport = options.transport ?? http2Transport;
  const now = options.now ?? (() => new Date());
  let cached: { issuedAt: number; jwt: string } | null = null;
  // Apple rejects provider tokens older than an hour and throttles frequent refreshes.
  const providerToken = () => {
    const at = now().getTime();
    if (cached && at - cached.issuedAt < TOKEN_REFRESH_MS) return cached.jwt;
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const header = encode({ alg: "ES256", kid: config.keyId });
    const claims = encode({ iat: Math.floor(at / 1000), iss: config.teamId });
    const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
      dsaEncoding: "ieee-p1363",
      key: createPrivateKey(config.privateKey),
    });
    cached = { issuedAt: at, jwt: `${header}.${claims}.${signature.toString("base64url")}` };
    return cached.jwt;
  };
  return {
    topic: config.topic,
    async send(token, environment, message) {
      const response = await transport({
        body: apnsPayload(message),
        environment,
        headers: {
          "apns-collapse-id": message.collapseId.slice(0, 64),
          "apns-expiration": String(Math.floor(now().getTime() / 1000) + 24 * 60 * 60),
          "apns-priority": "10",
          "apns-push-type": "alert",
          "apns-topic": config.topic,
          authorization: `bearer ${providerToken()}`,
        },
        path: `/3/device/${token}`,
      });
      if (response.status === 200) return { kind: "sent" };
      const reason = reasonOf(response.body);
      if (response.status === 410 || INVALID_TOKEN_REASONS.has(reason)) {
        return { kind: "invalid_token", reason };
      }
      if (response.status === 429 || response.status >= 500) return { kind: "retryable", reason };
      return { kind: "rejected", reason };
    },
  };
}

export function defaultPushSender(): PushSender | null {
  const config = apnsConfig();
  return config ? createApnsSender(config) : null;
}
