export type MigrationTargetHostKind = "loopback" | "private" | "public";

function normalizedHost(hostname: string) {
  const lower = hostname.toLowerCase();
  const unwrapped = lower.startsWith("[") && lower.endsWith("]") ? lower.slice(1, -1) : lower;

  return unwrapped.endsWith(".") ? unwrapped.slice(0, -1) : unwrapped;
}

function parseIpv4(hostname: string) {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;

  const octets = parts.map((part) => (/^\d+$/.test(part) ? Number(part) : Number.NaN));
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;

  return octets as [number, number, number, number];
}

function mappedIpv4(hostname: string) {
  const match = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(hostname);
  if (!match) return null;

  const high = Number.parseInt(match[1] ?? "", 16);
  const low = Number.parseInt(match[2] ?? "", 16);
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null;

  return [(high >> 8) & 255, high & 255, (low >> 8) & 255, low & 255].join(".");
}

function isLoopbackHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "0.0.0.0" || hostname === "::1") return true;

  const octets = parseIpv4(hostname);
  if (octets?.[0] === 127) return true;

  const mapped = mappedIpv4(hostname);
  return mapped ? isLoopbackHost(mapped) : false;
}

function isPrivateLanHost(hostname: string): boolean {
  if (isLoopbackHost(hostname)) return false;
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) return true;

  const octets = parseIpv4(hostname);
  if (octets) {
    const [first, second] = octets;
    return (
      first === 10 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }

  const mapped = mappedIpv4(hostname);
  return mapped ? isPrivateLanHost(mapped) : false;
}

export function migrationTargetHostKind(raw: string): MigrationTargetHostKind | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    const hostname = normalizedHost(url.hostname);
    if (!hostname) return null;
    if (isLoopbackHost(hostname)) return "loopback";
    if (isPrivateLanHost(hostname)) return "private";
    return "public";
  } catch {
    return null;
  }
}

export function loopbackTunnelCommand(raw: string) {
  try {
    const url = new URL(raw.trim());
    if (normalizedHost(url.hostname) === "0.0.0.0") url.hostname = "localhost";
    return `cloudflared tunnel --url ${url.origin}`;
  } catch {
    return "cloudflared tunnel --url http://localhost:3000";
  }
}
