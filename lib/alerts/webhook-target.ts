import { isIPv6 } from "node:net";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export const PRIVATE_NETWORK_WEBHOOK_ERROR =
  "Webhook URL targets a private-network target. Set WEBHOOK_ALLOW_PRIVATE_NETWORK=1 only for self-hosted internal delivery.";

export type WebhookGuardOptions = {
  allowPrivateNetwork?: boolean;
};

export function privateNetworkAllowed(options: WebhookGuardOptions) {
  if (options.allowPrivateNetwork !== undefined) {
    return options.allowPrivateNetwork;
  }

  return typeof process !== "undefined" && process.env.WEBHOOK_ALLOW_PRIVATE_NETWORK === "1";
}

export function isAllowedWebhookProtocol(protocol: string) {
  return ALLOWED_PROTOCOLS.has(protocol);
}

export function normalizedWebhookHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    return normalized.slice(1, -1);
  }
  return normalized;
}

function isIpv4Address(address: string) {
  const parts = address.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
  );
}

function blocksIpv4Address(address: string) {
  const [first = 0, second = 0] = address.split(".").map(Number);

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 192 && second === 168)
  );
}

function ipv4Parts(address: string) {
  return isIpv4Address(address) ? address.split(".").map(Number) : null;
}

function ipv4Hextets(address: string) {
  const parts = ipv4Parts(address);
  if (!parts) return null;
  const [first = 0, second = 0, third = 0, fourth = 0] = parts;
  return [(first << 8) | second, (third << 8) | fourth];
}

function parseHextet(part: string) {
  if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
  return Number.parseInt(part, 16);
}

function expandIpv6Address(address: string) {
  const withoutZone = address.toLowerCase().split("%")[0] ?? "";
  if (!isIPv6(withoutZone)) return null;
  const lastPart = withoutZone.slice(withoutZone.lastIndexOf(":") + 1);
  const mapped = ipv4Hextets(lastPart);
  const normalized = mapped
    ? `${withoutZone.slice(0, withoutZone.lastIndexOf(":"))}:${mapped[0].toString(16)}:${mapped[1].toString(16)}`
    : withoutZone;
  const compressed = normalized.includes("::");
  const [left = "", right = ""] = compressed ? normalized.split("::") : [normalized, ""];
  const leftParts = left ? left.split(":") : [];
  const rightParts = right ? right.split(":") : [];
  const missing = compressed ? 8 - leftParts.length - rightParts.length : 0;
  const parts = compressed
    ? [...leftParts, ...new Array(Math.max(missing, 0)).fill("0"), ...rightParts]
    : normalized.split(":");
  if (parts.length !== 8 || (compressed && missing < 1)) return null;
  const hextets = parts.map(parseHextet);
  return hextets.every((part) => part !== null) ? (hextets as number[]) : null;
}

function ipv4FromHextets(hextets: number[]) {
  const [high = 0, low = 0] = hextets.slice(6);
  return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}

function startsWithZeroHextets(hextets: number[], count: number) {
  return hextets.slice(0, count).every((part) => part === 0);
}

function blocksMappedIpv4Address(hextets: number[]) {
  const isMapped = startsWithZeroHextets(hextets, 5) && hextets[5] === 0xffff;
  const isCompatible = startsWithZeroHextets(hextets, 6);
  if (!isMapped && !isCompatible) {
    return false;
  }
  return blocksIpv4Address(ipv4FromHextets(hextets));
}

function blocksIpv6Address(address: string) {
  const hextets = expandIpv6Address(address);
  if (!hextets) {
    return false;
  }
  if (
    hextets.every((part) => part === 0) ||
    (startsWithZeroHextets(hextets, 7) && hextets[7] === 1)
  ) {
    return true;
  }
  if (blocksMappedIpv4Address(hextets)) {
    return true;
  }

  const firstHextet = hextets[0] ?? 0;
  return (firstHextet & 0xfe00) === 0xfc00 || (firstHextet & 0xffc0) === 0xfe80;
}

export function isBlockedWebhookAddress(address: string) {
  const normalized = normalizedWebhookHostname(address);

  if (isIpv4Address(normalized)) {
    return blocksIpv4Address(normalized);
  }
  if (normalized.includes(":")) {
    return blocksIpv6Address(normalized);
  }

  return false;
}

export function hasBlockedLiteralWebhookTarget(value: string) {
  if (!URL.canParse(value)) {
    return false;
  }

  const url = new URL(value);
  const hostname = normalizedWebhookHostname(url.hostname);
  return (
    isAllowedWebhookProtocol(url.protocol) &&
    !privateNetworkAllowed({}) &&
    (hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      isBlockedWebhookAddress(hostname))
  );
}
