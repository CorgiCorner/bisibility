import "server-only";

import { buildPublicDomainIconUrl } from "@/lib/ui/domain-icon-url";

const maxIconBytes = 32 * 1024;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export async function reportCardFavicon(domain?: string | null): Promise<string | undefined> {
  const url = buildPublicDomainIconUrl({ domain });
  if (!url) return;
  const options = {
    cache: "force-cache",
    next: { revalidate: 86_400 },
    redirect: "manual",
    signal: AbortSignal.timeout(1500),
  } as const;

  try {
    let response = await fetch(url, options);
    if (response.status === 301 || response.status === 302) {
      const location = new URL(response.headers.get("location") ?? "", url);
      if (
        !/^https:\/\/t[0-3]\.gstatic\.com$/.test(location.origin) ||
        location.username ||
        location.password ||
        location.pathname !== "/faviconV2"
      )
        return;
      response = await fetch(location, options);
    }
    if (!response.ok || response.headers.get("content-type") !== "image/png" || !response.body)
      return;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxIconBytes) {
        await reader.cancel();
        return;
      }
      chunks.push(value);
    }
    const png = Buffer.concat(chunks, length);
    if (png.length < 33 || !png.subarray(0, 8).equals(pngSignature)) return;
    // Google sends a smaller generic globe for domains without an icon.
    if (png.readUInt32BE(16) !== 32 || png.readUInt32BE(20) !== 32) return;
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return;
  }
}
