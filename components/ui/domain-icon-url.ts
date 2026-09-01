export type DomainIconUrlInput = {
  domain?: string | null;
  size?: number;
};

const NON_PUBLIC_HOST_SUFFIXES = new Set([
  "example",
  "internal",
  "invalid",
  "local",
  "localhost",
  "onion",
  "test",
]);

export function domainIconHost(domain: string | null | undefined) {
  const value = domain?.trim();
  if (!value) {
    return null;
  }

  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(value)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https") {
    return null;
  }
  const hasBareScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
  const hasHostPort = /^[^/:?#\s]+:\d+(?:[/?#]|$)/.test(value);
  if (!scheme && hasBareScheme && !hasHostPort) {
    return null;
  }

  const url = value.startsWith("//") ? `https:${value}` : scheme ? value : `https://${value}`;

  try {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
    const labels = host.split(".");

    return host && labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
      ? host
      : null;
  } catch {
    return null;
  }
}

export function buildDomainIconUrl({ domain }: DomainIconUrlInput) {
  if (process.env.NEXT_PUBLIC_DOMAIN_ICONS === "off") {
    return null;
  }

  const host = domainIconHost(domain);
  if (!host) {
    return null;
  }

  const params = new URLSearchParams({ domain: host, sz: "32" });
  return `https://www.google.com/s2/favicons?${params.toString()}`;
}

function isPublicFaviconHost(host: string) {
  const labels = host.split(".");
  const suffix = labels.at(-1);
  const isIpv4Address = labels.length === 4 && labels.every((label) => /^\d{1,3}$/.test(label));

  return (
    labels.length > 1 &&
    suffix !== undefined &&
    !NON_PUBLIC_HOST_SUFFIXES.has(suffix) &&
    !isIpv4Address
  );
}

export function buildPublicDomainIconUrl({ domain }: DomainIconUrlInput) {
  const host = domainIconHost(domain);
  if (!host || !isPublicFaviconHost(host)) {
    return null;
  }

  return buildDomainIconUrl({ domain: host });
}
