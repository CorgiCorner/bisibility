export type DomainIconUrlInput = {
  domain?: string | null;
  size?: number;
};

function normalizeHost(domain: string | null | undefined) {
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

export function buildDomainIconUrl({ domain, size = 64 }: DomainIconUrlInput) {
  if (process.env.NEXT_PUBLIC_DOMAIN_ICONS === "off") {
    return null;
  }

  const host = normalizeHost(domain);
  if (!host) {
    return null;
  }

  const params = new URLSearchParams({ domain: host, sz: String(size) });
  return `https://www.google.com/s2/favicons?${params.toString()}`;
}
