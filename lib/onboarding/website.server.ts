import "server-only";

import { parse } from "tldts";
import type { WebsiteProjectIdentity } from "./website";

const websiteError = "Enter a website like example.com.";

function websiteUrl(value: string) {
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(candidate);
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new Error(websiteError);
  }
  return url;
}

export function websiteProjectIdentity(value: string): WebsiteProjectIdentity {
  let url: URL;
  try {
    url = websiteUrl(value.trim());
  } catch {
    throw new Error(websiteError);
  }

  const parsed = parse(url.hostname, { allowPrivateDomains: true });
  if (!parsed.domain || !parsed.domainWithoutSuffix || (!parsed.isIcann && !parsed.isPrivate)) {
    throw new Error(websiteError);
  }

  return {
    domain: parsed.domain.toLowerCase(),
    name: parsed.domainWithoutSuffix.toLowerCase(),
  };
}
