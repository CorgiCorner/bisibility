export type MigrationTargetValidation =
  | { ok: true; origin: string }
  | { ok: false; reason: string };

const ALLOWED_PORTS = new Set(["", "80", "443", "8443"]);
const PRIVATE_HOST_REASON = "Target URL host must not be localhost or a private network address.";

function normalizedHost(hostname: string) {
  const lower = hostname.toLowerCase();
  const unwrapped = lower.startsWith("[") && lower.endsWith("]") ? lower.slice(1, -1) : lower;

  return unwrapped.endsWith(".") ? unwrapped.slice(0, -1) : unwrapped;
}

function allowsInsecureLoopbackPort(hostname: string) {
  // INSECURE LOCAL-DEV ESCAPE HATCH: never enable for production instances or real
  // user data. The NODE_ENV gate enforces that promise instead of only stating it.
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.MIGRATION_ALLOW_INSECURE_LOOPBACK_TARGET === "1" &&
    (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1")
  );
}

function tailAfterAuthority(raw: string) {
  const authorityStart = raw.indexOf("://") + 3;
  const tailOffset = raw.slice(authorityStart).search(/[/?#]/);
  return tailOffset < 0 ? "" : raw.slice(authorityStart + tailOffset);
}

function includesCredentials(raw: string, url: URL) {
  const authority = /^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i.exec(raw)?.[1] ?? "";

  return Boolean(url.username || url.password || authority.includes("@"));
}

function parseIpv4(hostname: string) {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;

  const octets = parts.map((part) => (/^\d+$/.test(part) ? Number(part) : Number.NaN));
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;

  return octets as [number, number, number, number];
}

function isPrivateIpv4(hostname: string) {
  const octets = parseIpv4(hostname);
  if (!octets) return false;

  const [first, second] = octets;

  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function mappedIpv4(hostname: string) {
  const match = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(hostname);
  if (!match) return null;

  const high = Number.parseInt(match[1] ?? "", 16);
  const low = Number.parseInt(match[2] ?? "", 16);
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null;

  return [(high >> 8) & 255, high & 255, (low >> 8) & 255, low & 255].join(".");
}

function isLoopbackOrLinkLocalIpv6(hostname: string) {
  if (!hostname.includes(":")) return false;
  if (hostname === "::1") return true;

  const firstHextet = Number.parseInt(hostname.split(":")[0] ?? "", 16);

  return Number.isFinite(firstHextet) && firstHextet >= 0xfe80 && firstHextet <= 0xfebf;
}

function hasReservedHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "local" ||
    hostname === "internal" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  );
}

function isBlockedHost(hostname: string) {
  const mapped = mappedIpv4(hostname);

  return (
    hasReservedHostname(hostname) ||
    isPrivateIpv4(hostname) ||
    Boolean(mapped && isPrivateIpv4(mapped)) ||
    isLoopbackOrLinkLocalIpv6(hostname)
  );
}

function allowlistEntries() {
  return (process.env.BISIBILITY_MIGRATION_TARGET_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => normalizedHost(entry.trim()))
    .filter(Boolean);
}

function matchesAllowlist(hostname: string) {
  const entries = allowlistEntries();
  if (entries.length === 0) return true;

  return entries.some((entry) => {
    if (!entry.startsWith("*.")) return hostname === entry;

    const suffix = entry.slice(2);

    return hostname.endsWith(`.${suffix}`);
  });
}

function protocolReason(allowHttp: boolean) {
  return allowHttp
    ? "Target URL protocol must be https or http."
    : "Target URL protocol must be https.";
}

export function validateMigrationTargetUrl(
  raw: string,
  options: { allowHttp?: boolean; allowPrivateHosts?: boolean } = {},
): MigrationTargetValidation {
  const input = raw.trim();
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "Target URL must be an absolute URL." };
  }

  const allowHttp = options.allowHttp === true;
  if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) {
    return { ok: false, reason: protocolReason(allowHttp) };
  }

  if (includesCredentials(input, url)) {
    return { ok: false, reason: "Target URL must not include credentials." };
  }

  const tail = tailAfterAuthority(input);
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "" || /[?#]/.test(tail)) {
    return {
      ok: false,
      reason: "Target URL must be an origin without a path, query, or hash.",
    };
  }

  const hostname = normalizedHost(url.hostname);
  if (!ALLOWED_PORTS.has(url.port) && !allowsInsecureLoopbackPort(hostname)) {
    return { ok: false, reason: "Target URL port must be empty, 80, 443, or 8443." };
  }

  if (options.allowPrivateHosts !== true && isBlockedHost(hostname)) {
    return { ok: false, reason: PRIVATE_HOST_REASON };
  }

  if (!matchesAllowlist(hostname)) {
    return {
      ok: false,
      reason: "Target URL host must be included in BISIBILITY_MIGRATION_TARGET_ALLOWLIST.",
    };
  }

  return { ok: true, origin: url.origin };
}
