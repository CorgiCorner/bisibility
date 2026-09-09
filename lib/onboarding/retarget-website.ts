/** Only exact old-host targets belong to this domain correction. */
export function retargetWebsiteUrl(
  targetUrl: string | null,
  oldDomain: string | null,
  newDomain: string,
) {
  if (!targetUrl || !oldDomain) return targetUrl;
  try {
    const url = new URL(targetUrl);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.hostname.toLowerCase() !== oldDomain.toLowerCase()
    )
      return targetUrl;
    url.hostname = newDomain;
    return url.href;
  } catch {
    return targetUrl;
  }
}
